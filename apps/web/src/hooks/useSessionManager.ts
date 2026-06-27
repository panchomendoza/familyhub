import { useEffect, useRef, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { SESSION_CONFIG } from "@/lib/sessionConfig";
import { api } from "@/lib/api";

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown", "touchstart", "scroll", "click",
] as const;

export interface SessionManagerState {
  // ── Modal de inactividad ──────────────────────────────────────────────
  idleWarning:     boolean;
  idleSecsLeft:    number;
  onIdleContinue:  () => void;

  // ── Modal de expiración de sesión ─────────────────────────────────────
  expiryWarning:   boolean;
  expirySecsLeft:  number;
  renewalAllowed:  boolean;
  onRenewSession:  () => Promise<void>;
  onSignOut:       () => void;

  // ── Sesión ya expirada (descubierta al hacer una petición) ────────────
  alreadyExpired:  boolean;
  onAcknowledge:   () => void;
}

export function useSessionManager(): SessionManagerState {
  const store = useAuthStore();
  const {
    user,
    sessionExpiresAt,
    renewalUsed,
    setAccessExpiresAt,
    setSessionExpiresAt,
    setRenewalUsed,
    logout,
  } = store;

  // ── Refs ──────────────────────────────────────────────────────────────
  const lastActivityRef    = useRef(Date.now());
  const idleWarningRef     = useRef(false);   // evita doble disparo
  const expiryWarningRef   = useRef(false);
  const renewingRef        = useRef(false);

  // ── Estado del modal de inactividad ──────────────────────────────────
  const [idleWarning,  setIdleWarning]  = useState(false);
  const [idleSecsLeft, setIdleSecsLeft] = useState(SESSION_CONFIG.IDLE_WARN_S);

  // ── Estado del modal de expiración ───────────────────────────────────
  const [expiryWarning,   setExpiryWarning]   = useState(false);
  const [expirySecsLeft,  setExpirySecsLeft]  = useState(SESSION_CONFIG.SESSION_WARN_S);

  // ── Sesión ya expirada (descubierta vía refresh fallido) ─────────────
  const [alreadyExpired,  setAlreadyExpired]  = useState(false);

  // ══════════════════════════════════════════════════════════════════════
  //  1. Rastrear actividad del usuario
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const touch = () => { lastActivityRef.current = Date.now(); };
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, touch, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, touch));
  }, []);

  // ══════════════════════════════════════════════════════════════════════
  //  2. Tick principal — chequea idle + proximidad de expiración
  // ══════════════════════════════════════════════════════════════════════

  /** Lógica compartida entre el tick y el visibilitychange */
  const checkSession = useCallback(() => {
    const now    = Date.now();
    const idleMs = now - lastActivityRef.current;

    // ── Inactividad ──────────────────────────────────────────────────────
    if (idleMs >= SESSION_CONFIG.IDLE_TIMEOUT_MS && !idleWarningRef.current) {
      idleWarningRef.current = true;
      setIdleSecsLeft(SESSION_CONFIG.IDLE_WARN_S);
      setIdleWarning(true);
    }

    // ── Aviso de expiración de sesión ────────────────────────────────────
    if (sessionExpiresAt && !expiryWarningRef.current) {
      const msLeft = new Date(sessionExpiresAt).getTime() - now;
      if (msLeft > 0 && msLeft <= SESSION_CONFIG.SESSION_WARN_MS) {
        expiryWarningRef.current = true;
        setExpirySecsLeft(Math.min(Math.floor(msLeft / 1000), SESSION_CONFIG.SESSION_WARN_S));
        setExpiryWarning(true);
      }
      // Expiración definitiva sin aviso previo (ej: tab en background)
      if (msLeft <= 0) {
        window.dispatchEvent(new CustomEvent("auth:expired"));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExpiresAt]);

  useEffect(() => {
    if (!user) return;
    const tick = setInterval(checkSession, SESSION_CONFIG.TICK_MS);
    return () => clearInterval(tick);
  }, [user, checkSession]);

  // ── Chequeo inmediato al volver al tab (browser throttlea timers en background) ──
  useEffect(() => {
    if (!user) return;
    const handleVisible = () => {
      if (document.visibilityState === "visible") checkSession();
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [user, checkSession]);

  // ── Actualizar sessionExpiresAt cuando el access token se renueva ────────────
  // (useAuth solo está montado en algunas páginas; aquí siempre está montado)
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ sessionExpiresAt?: string | null }>).detail ?? {};
      if (d.sessionExpiresAt) setSessionExpiresAt(d.sessionExpiresAt);
    };
    window.addEventListener("auth:refreshed", handler);
    return () => window.removeEventListener("auth:refreshed", handler);
  }, [setSessionExpiresAt]);

  // ── Sesión ya expirada (refresh falló) — mostrar aviso antes de redirigir ──
  useEffect(() => {
    const handler = () => {
      if (!alreadyExpired) setAlreadyExpired(true);
    };
    window.addEventListener("auth:session-expired", handler);
    return () => window.removeEventListener("auth:session-expired", handler);
  }, [alreadyExpired]);

  // ══════════════════════════════════════════════════════════════════════
  //  3. Countdown de inactividad
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!idleWarning) return;
    const cd = setInterval(() => {
      setIdleSecsLeft(s => {
        if (s <= 1) {
          clearInterval(cd);
          setIdleWarning(false);
          window.dispatchEvent(new CustomEvent("auth:expired"));
          return 0;
        }
        return s - 1;
      });
    }, 1_000);
    return () => clearInterval(cd);
  }, [idleWarning]);

  // ══════════════════════════════════════════════════════════════════════
  //  4. Countdown de expiración de sesión
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!expiryWarning) return;
    const cd = setInterval(() => {
      setExpirySecsLeft(s => {
        if (s <= 1) {
          clearInterval(cd);
          setExpiryWarning(false);
          window.dispatchEvent(new CustomEvent("auth:expired"));
          return 0;
        }
        return s - 1;
      });
    }, 1_000);
    return () => clearInterval(cd);
  }, [expiryWarning]);

  // ══════════════════════════════════════════════════════════════════════
  //  5. Acciones
  // ══════════════════════════════════════════════════════════════════════

  /** El usuario confirma que sigue activo (modal de inactividad) */
  const onIdleContinue = useCallback(() => {
    lastActivityRef.current = Date.now();
    idleWarningRef.current  = false;
    setIdleWarning(false);
  }, []);

  /** El usuario pide renovar la sesión (modal de expiración, solo 1 vez) */
  const onRenewSession = useCallback(async () => {
    if (renewingRef.current || renewalUsed) return;
    renewingRef.current = true;
    try {
      const { data } = await api.post<{
        ok: boolean;
        accessExpiresAt?:  string;
        sessionExpiresAt?: string;
        renewalUsed?:      boolean;
      }>("/auth/refresh", { renew: true });

      if (data.accessExpiresAt)  setAccessExpiresAt(data.accessExpiresAt);
      if (data.sessionExpiresAt) setSessionExpiresAt(data.sessionExpiresAt);
      if (data.renewalUsed !== undefined) setRenewalUsed(data.renewalUsed);

      expiryWarningRef.current = false;
      setExpiryWarning(false);
    } catch {
      // Si falla la renovación la sesión ya expiró en el servidor
      window.dispatchEvent(new CustomEvent("auth:expired"));
    } finally {
      renewingRef.current = false;
    }
  }, [renewalUsed, setAccessExpiresAt, setSessionExpiresAt, setRenewalUsed]);

  /** Cerrar sesión desde cualquier modal */
  const onSignOut = useCallback(() => {
    setIdleWarning(false);
    setExpiryWarning(false);
    setAlreadyExpired(false);
    api.post("/auth/logout").catch(() => {});
    logout();
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }, [logout]);

  /** El usuario acepta que su sesión expiró → redirigir al login */
  const onAcknowledge = useCallback(() => {
    setAlreadyExpired(false);
    api.post("/auth/logout").catch(() => {});
    logout();
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }, [logout]);

  return {
    idleWarning,
    idleSecsLeft,
    onIdleContinue,
    expiryWarning,
    expirySecsLeft,
    renewalAllowed: !renewalUsed,
    onRenewSession,
    onSignOut,
    alreadyExpired,
    onAcknowledge,
  };
}
