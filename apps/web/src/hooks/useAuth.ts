import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { api, initCsrf, setCsrfToken } from "@/lib/api";
import type { LoginInput, RegisterInput, User, Family } from "@familyhub/types";

interface AuthSession {
  user:              User;
  families:          Family[];
  isNew?:            boolean;
  accessExpiresAt?:  string;
  sessionExpiresAt?: string | null;
  renewalUsed?:      boolean;
  csrfToken?:        string;
}

/** Aplica todos los campos de sesión al store de una vez */
function applySession(store: ReturnType<typeof useAuthStore.getState>, data: AuthSession) {
  store.setUser(data.user);
  store.setFamilies(data.families ?? []);
  store.setCurrentFamily(data.families?.[0] ?? null);
  if (data.accessExpiresAt)           store.setAccessExpiresAt(data.accessExpiresAt);
  if (data.sessionExpiresAt)          store.setSessionExpiresAt(data.sessionExpiresAt);
  if (data.renewalUsed !== undefined) store.setRenewalUsed(data.renewalUsed);
  // Guardar el token CSRF en memoria — necesario en cross-domain (producción)
  if (data.csrfToken)                 setCsrfToken(data.csrfToken);
}

export function useAuth() {
  const store       = useAuthStore();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  // ── Escuchar refresh exitoso (auto o manual) ───────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<Partial<AuthSession>>).detail ?? {};
      if (d.accessExpiresAt)        store.setAccessExpiresAt(d.accessExpiresAt);
      if (d.sessionExpiresAt)       store.setSessionExpiresAt(d.sessionExpiresAt);
      if (d.renewalUsed !== undefined) store.setRenewalUsed(d.renewalUsed);
    };
    window.addEventListener("auth:refreshed", handler);
    return () => window.removeEventListener("auth:refreshed", handler);
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────
  const login = useCallback(async (input: LoginInput) => {
    const { data } = await api.post<AuthSession>("/auth/login", input);
    applySession(useAuthStore.getState(), data);
    navigate(!data.families?.length ? "/onboarding" : "/home");
  }, [navigate]);

  // ── Google ─────────────────────────────────────────────────────────────
  const loginWithGoogle = useCallback(async (googleToken: string) => {
    const { data } = await api.post<AuthSession>("/auth/google", { token: googleToken });
    applySession(useAuthStore.getState(), data);
    navigate(data.isNew || !data.families?.length ? "/onboarding" : "/home");
  }, [navigate]);

  const register = useCallback(async (input: RegisterInput) => {
    await api.post("/auth/register", input);
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const { data } = await api.post<AuthSession>("/auth/verify-email", { email, code });
    store.setUser(data.user);
    navigate("/onboarding");
  }, [navigate]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    store.logout();
    // Limpiar todo el caché de React Query para no ver datos de la sesión anterior
    queryClient.clear();
    // Obtener CSRF fresco de inmediato para que el login sin reload funcione
    initCsrf().catch(() => {});
    navigate("/login");
  }, [navigate, queryClient]);

  return {
    user:            store.user,
    currentFamily:   store.currentFamily,
    families:        store.families,
    isLoading:       store.isLoading,
    isAuthenticated: !!store.user,
    login,
    loginWithGoogle,
    register,
    verifyEmail,
    logout,
  };
}
