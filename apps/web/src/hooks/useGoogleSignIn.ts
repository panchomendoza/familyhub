import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./useAuth";
import { loadGsi, initializeGsiOnce, GOOGLE_CLIENT_ID } from "@/lib/googleAuth";
import type { GsiCredentialResponse } from "@/lib/googleAuth";

// ══════════════════════════════════════════════════════════════
//   useGoogleSignIn — hook público
//
//   Flujo:
//     1. Carga el script GSI de Google (una vez, singleton)
//     2. Inicializa google.accounts.id con el callback
//     3. signIn() → llama a prompt() (One Tap / popup)
//        Si One Tap está bloqueado → activa showFallback
//        → renderButton() en fallbackRef monta el botón oficial de Google
//     4. El callback recibe el ID token → loginWithGoogle() → navega
// ══════════════════════════════════════════════════════════════

export interface UseGoogleSignInResult {
  /** Llama a google.accounts.id.prompt() — activar al click del botón */
  signIn:       () => void;
  /** true mientras se está completando el login con el backend */
  loading:      boolean;
  /** mensaje de error o null */
  error:        string | null;
  clearError:   () => void;
  /** ref para el div donde se renderiza el botón oficial de Google (fallback) */
  fallbackRef:  React.RefObject<HTMLDivElement>;
  /** true cuando One Tap fue bloqueado y se mostró el botón oficial en su lugar */
  showFallback: boolean;
  /** false si VITE_GOOGLE_CLIENT_ID no está configurado */
  available:    boolean;
}

export function useGoogleSignIn(): UseGoogleSignInResult {
  const { loginWithGoogle } = useAuth();

  // Ref para que el callback de GSI siempre use la función más reciente
  const loginRef = useRef(loginWithGoogle);
  useEffect(() => { loginRef.current = loginWithGoogle; });

  const [gsiReady,     setGsiReady]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const fallbackRef                     = useRef<HTMLDivElement>(null);

  // ── Carga e inicialización de GSI (una vez) ─────────────────
  useEffect(() => {
    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId) return;

    loadGsi()
      .then(() => {
        initializeGsiOnce(clientId, handleCredential);
        setGsiReady(true);
      })
      .catch(() => {
        setError("No se pudo conectar con Google. Verifica tu conexión.");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Renderiza el botón oficial de Google cuando One Tap falla ─
  useEffect(() => {
    if (!showFallback || !fallbackRef.current || !window.google) return;
    window.google.accounts.id.renderButton(fallbackRef.current, {
      theme:  "filled_black",
      size:   "large",
      text:   "continue_with",
      width:  fallbackRef.current.offsetWidth || 320,
      shape:  "rectangular",
    });
  }, [showFallback]);

  // ── Callback que recibe el ID token de Google ─────────────────
  function handleCredential(response: GsiCredentialResponse) {
    setLoading(true);
    setError(null);
    loginRef.current(response.credential).catch(() => {
      setError("Error al iniciar sesión con Google. Intenta de nuevo.");
      setLoading(false);
    });
    // Si loginWithGoogle tiene éxito, navega y el componente se desmonta.
    // No hace falta setLoading(false) en el camino feliz.
  }

  // ── Disparador principal ─────────────────────────────────────
  const signIn = useCallback(() => {
    if (!gsiReady || !window.google) {
      setError("Google no disponible. Recarga la página e intenta de nuevo.");
      return;
    }
    setError(null);
    setShowFallback(false);

    window.google.accounts.id.prompt((notification) => {
      // isNotDisplayed: GSI no puede mostrar el prompt (política del navegador, etc.)
      // isSkippedMoment: One Tap fue omitido (pre-FedCM)
      // isDismissedMoment sin credential_returned: FedCM cerró sin éxito
      const shouldFallback =
        notification.isNotDisplayed() ||
        notification.isSkippedMoment() ||
        (notification.isDismissedMoment() &&
          notification.getDismissedReason() !== "credential_returned");

      if (shouldFallback) setShowFallback(true);
    });
  }, [gsiReady]);

  return {
    signIn,
    loading,
    error,
    clearError:   () => setError(null),
    fallbackRef,
    showFallback,
    available:    !!GOOGLE_CLIENT_ID,
  };
}
