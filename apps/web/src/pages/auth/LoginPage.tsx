import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/auth.store";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { initCsrf, type ApiError } from "@/lib/api";
import { features } from "@/config/features";
import {
  AuthBg, AuthCard, AuthInput, AuthBtn, AuthError, AuthSuccess,
  AuthDivider, GoogleBtn, AuthLink,
} from "./AuthLayout";

interface ErrBody { error: string }

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const { isHydrated, families }   = useAuthStore();
  const {
    signIn:       googleSignIn,
    loading:      googleLoading,
    error:        googleError,
    clearError:   clearGoogleError,
    fallbackRef,
    showFallback,
    available:    googleAvailable,
  } = useGoogleSignIn();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/home";
  const justVerified = (location.state as { verified?: boolean })?.verified ?? false;

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => { initCsrf(); }, []);

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      navigate(families.length ? from : "/onboarding", { replace: true });
    }
  }, [isHydrated, isAuthenticated, families, from, navigate]);

  async function handleLogin() {
    if (!email.trim()) { setError("Ingresa tu email."); return; }
    if (!password)     { setError("Ingresa tu contraseña."); return; }
    setError(null);
    setLoading(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
    } catch (err) {
      const code = (err as ApiError<ErrBody>).data?.error;
      if (code === "EMAIL_NOT_VERIFIED") {
        navigate("/verify", { state: { email: email.trim().toLowerCase() } });
        return;
      }
      setError(code ?? "Error al iniciar sesión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthBg>
      <Helmet>
        <title>Iniciar sesión — FamilyHub</title>
        <meta name="description" content="Accede a tu hogar familiar. Gestiona salud, gastos y stock en un solo lugar." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <AuthCard title="Iniciar sesión">
        <AuthSuccess msg={justVerified ? "Email verificado. Ya puedes iniciar sesión." : null} />
        <AuthError   msg={error} />

        <form onSubmit={e => { e.preventDefault(); handleLogin(); }} noValidate>
          <AuthInput
            label="USUARIO O EMAIL"
            placeholder="tu@email.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(null); }}
            icon="👤"
            autoComplete="email"
            disabled={loading}
          />
          <AuthInput
            label="CONTRASEÑA"
            type="password"
            placeholder="Tu contraseña"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            icon="🔒"
            autoComplete="current-password"
            disabled={loading}
          />

          {/* ¿Olvidaste? */}
          {features.forgotPassword && (
            <div style={{ textAlign: "right", marginBottom: 20, marginTop: -6 }}>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                style={{ background: "none", border: "none", color: "#5566AA", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          <AuthBtn type="submit" loading={loading} disabled={!email || !password}>
            Entrar →
          </AuthBtn>
        </form>

        {features.googleLogin && googleAvailable && (
          <>
            <AuthDivider />
            <AuthError msg={googleError} />
            <GoogleBtn
              onClick={() => { clearGoogleError(); googleSignIn(); }}
              loading={googleLoading}
            />
            {/* Botón oficial de Google como fallback si One Tap es bloqueado */}
            {showFallback && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 11, color: "#8899CC", textAlign: "center", marginBottom: 8 }}>
                  El popup de Google fue bloqueado. Usa este botón:
                </p>
                <div ref={fallbackRef} style={{ display: "flex", justifyContent: "center" }} />
              </div>
            )}
          </>
        )}

        {features.register && (
          <p style={{ marginTop: 20, fontSize: 12, color: "#5566AA", textAlign: "center" }}>
            ¿No tienes cuenta?{" "}
            <AuthLink label="Regístrate" onClick={() => navigate("/register")} />
          </p>
        )}
      </AuthCard>
    </AuthBg>
  );
}
