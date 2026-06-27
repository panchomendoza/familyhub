import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Muestra un aviso N segundos antes de que expire el access token.
 * @param warnBeforeMs  Milisegundos antes de la expiración para mostrar el modal (default: 15s)
 */
export function useSessionWarning(warnBeforeMs = 15_000) {
  const accessExpiresAt = useAuthStore((s) => s.accessExpiresAt);
  const [showWarning, setShowWarning] = useState(false);
  const [secsLeft, setSecsLeft]       = useState(0);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Limpia timers anteriores
    if (timerRef.current)    clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setShowWarning(false);

    if (!accessExpiresAt) return;

    const expiresMs = new Date(accessExpiresAt).getTime();
    const nowMs     = Date.now();
    const warnAt    = expiresMs - warnBeforeMs;
    const delay     = warnAt - nowMs;

    if (delay <= 0) {
      // Ya estamos dentro de la ventana de aviso (o expiró)
      const remaining = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
      setSecsLeft(remaining);
      if (remaining > 0) setShowWarning(true);
      return;
    }

    timerRef.current = setTimeout(() => {
      setSecsLeft(Math.floor(warnBeforeMs / 1000));
      setShowWarning(true);

      intervalRef.current = setInterval(() => {
        const s = Math.max(0, Math.floor((new Date(accessExpiresAt).getTime() - Date.now()) / 1000));
        setSecsLeft(s);
        if (s <= 0) {
          clearInterval(intervalRef.current!);
          setShowWarning(false);
        }
      }, 1000);
    }, delay);

    return () => {
      if (timerRef.current)    clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [accessExpiresAt, warnBeforeMs]);

  function dismiss() {
    setShowWarning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  return { showWarning, secsLeft, dismiss };
}
