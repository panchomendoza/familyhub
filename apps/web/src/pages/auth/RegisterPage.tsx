import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/auth.store";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { initCsrf, type ApiError } from "@/lib/api";
import { features } from "@/config/features";

interface ErrBody { error: string }

// ── Estilos (mismo sistema que ForgotPasswordPage) ───────────────────────────
const S = {
  bg: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0F1B3D 0%, #1A1150 45%, #0D2640 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Inter', 'Segoe UI', sans-serif", padding: "20px",
  } as React.CSSProperties,
  card: {
    width: "100%", maxWidth: 400,
    background: "rgba(255,255,255,0.04)",
    border: "1.5px solid rgba(255,255,255,0.1)",
    borderRadius: 20, padding: "36px 32px",
    backdropFilter: "blur(12px)",
    animation: "fadeUp 0.35s ease both",
  } as React.CSSProperties,
  label: {
    display: "block", fontSize: 11, fontWeight: 700,
    color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", marginBottom: 6,
  } as React.CSSProperties,
  input: {
    width: "100%", padding: "12px 14px", borderRadius: 10, fontSize: 15,
    background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)",
    color: "#fff", outline: "none", boxSizing: "border-box" as const,
    fontFamily: "inherit", transition: "border-color 0.15s",
  } as React.CSSProperties,
  btn: {
    width: "100%", padding: "13px", borderRadius: 11, fontSize: 15,
    fontWeight: 700, border: "none", cursor: "pointer",
    background: "linear-gradient(135deg, #4F7BF7, #7B5CF7)",
    color: "#fff", fontFamily: "inherit", marginTop: 20,
    transition: "opacity 0.15s",
  } as React.CSSProperties,
  error: {
    background: "rgba(247,79,123,0.12)", border: "1px solid rgba(247,79,123,0.3)",
    borderRadius: 10, padding: "10px 14px", fontSize: 13,
    color: "#F74F7B", marginBottom: 16,
  } as React.CSSProperties,
};

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
      {[1, 2].map(n => (
        <div key={n} style={{
          height: 4, flex: n === step ? 2 : 1, borderRadius: 99,
          background: n <= step ? "#4F7BF7" : "rgba(255,255,255,0.15)",
          transition: "all 0.3s ease",
        }} />
      ))}
    </div>
  );
}

function strengthScore(pwd: string) {
  let s = 0;
  if (pwd.length >= 8)          s++;
  if (pwd.length >= 12)         s++;
  if (/[A-Z]/.test(pwd))        s++;
  if (/[0-9]/.test(pwd))        s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return [
    { label: "Muy débil", color: "#F74F7B" },
    { label: "Débil",     color: "#F7874F" },
    { label: "Regular",   color: "#F7C94F" },
    { label: "Buena",     color: "#A4F74F" },
    { label: "Fuerte",    color: "#34C78A" },
  ][Math.min(s, 4)]!;
}

// ── Step 1: Nombre + Email ───────────────────────────────────────────────────
function StepInfo({ onNext }: { onNext: (name: string, email: string) => void }) {
  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const {
    signIn:       googleSignIn,
    loading:      googleLoading,
    error:        googleError,
    clearError:   clearGoogleError,
    fallbackRef,
    showFallback,
    available:    googleAvailable,
  } = useGoogleSignIn();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2)  { setError("El nombre debe tener al menos 2 caracteres."); return; }
    if (!email.includes("@"))    { setError("Ingresa un email válido."); return; }
    onNext(name.trim(), email.trim().toLowerCase());
  }

  return (
    <form onSubmit={submit}>
      <StepDots step={1} />
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Crear cuenta</h1>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24, lineHeight: 1.5 }}>
        Primero cuéntanos quién eres.
      </p>

      {/* ── Google sign-up ── */}
      {features.googleLogin && googleAvailable && (
        <>
          {googleError && (
            <div style={{ ...S.error, marginBottom: 14 }}>{googleError}</div>
          )}
          <button
            type="button"
            onClick={() => { clearGoogleError(); googleSignIn(); }}
            disabled={googleLoading}
            style={{
              width: "100%", padding: "13px", borderRadius: 11, fontSize: 14,
              fontWeight: 600, border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)", color: "#fff",
              fontFamily: "inherit", cursor: googleLoading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              opacity: googleLoading ? 0.6 : 1, transition: "background 0.18s",
              marginBottom: 16,
            }}
          >
            {googleLoading ? (
              <span style={{
                display: "inline-block", width: 18, height: 18, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
                animation: "spin 0.7s linear infinite",
              }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
                <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3-11.3-7.5l-6.6 5.1C9.8 40.1 16.4 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.2 5.2C40.7 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
              </svg>
            )}
            {googleLoading ? "Iniciando sesión…" : "Continuar con Google"}
          </button>
          {showFallback && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center", marginBottom: 8 }}>
                El popup fue bloqueado. Usa este botón:
              </p>
              <div ref={fallbackRef} style={{ display: "flex", justifyContent: "center" }} />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>o continúa con email</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          </div>
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={S.label}>NOMBRE COMPLETO</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Tu nombre" autoFocus autoComplete="name"
            style={S.input}
          />
        </div>
        <div>
          <label style={S.label}>EMAIL</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com" autoComplete="email"
            style={S.input}
          />
        </div>
      </div>

      {error && <div style={{ ...S.error, marginTop: 14 }}>{error}</div>}

      <button type="submit" style={S.btn}>
        Siguiente →
      </button>
    </form>
  );
}

// ── Step 2: Contraseña ───────────────────────────────────────────────────────
function StepPassword({
  name, email,
  onBack, onDone, onForgot,
}: {
  name: string; email: string;
  onBack: () => void;
  onDone: () => void;
  onForgot: () => void;
}) {
  const { register } = useAuth();

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPwd,   setShowPwd]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const strength = password ? strengthScore(password) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8)      { setError("Mínimo 8 caracteres."); return; }
    if (!/[A-Z]/.test(password))  { setError("Debe tener al menos una mayúscula."); return; }
    if (!/[0-9]/.test(password))  { setError("Debe tener al menos un número."); return; }
    if (password !== confirm)      { setError("Las contraseñas no coinciden."); return; }
    setError("");
    setLoading(true);
    try {
      await register({ name, email, password, confirmPassword: confirm });
      onDone();
    } catch (err) {
      const code = (err as ApiError<ErrBody>).data?.error;
      if (code === "EMAIL_ALREADY_EXISTS") {
        setError("EMAIL_EXISTS");
      } else {
        setError(code ?? "Error al crear la cuenta. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <StepDots step={2} />
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Elige tu contraseña</h1>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24, lineHeight: 1.5 }}>
        Creando cuenta para <strong style={{ color: "rgba(255,255,255,0.7)" }}>{email}</strong>
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={S.label}>CONTRASEÑA</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPwd ? "text" : "password"}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mín. 8 caracteres, 1 mayúscula, 1 número"
              autoFocus autoComplete="new-password"
              style={{ ...S.input, paddingRight: 42 }}
            />
            <button
              type="button" onClick={() => setShowPwd(v => !v)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "rgba(255,255,255,0.4)", padding: 0 }}
            >{showPwd ? "🙈" : "👁️"}</button>
          </div>
          {strength && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 4, height: 4, borderRadius: 99, overflow: "hidden" }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ flex: 1, borderRadius: 99, background: i < ["Muy débil","Débil","Regular","Buena","Fuerte"].indexOf(strength.label) ? strength.color : "rgba(255,255,255,0.1)", transition: "background 0.2s" }} />
                ))}
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: strength.color }}>Fortaleza: {strength.label}</p>
            </div>
          )}
        </div>

        <div>
          <label style={S.label}>CONFIRMAR CONTRASEÑA</label>
          <input
            type={showPwd ? "text" : "password"}
            value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Repite tu contraseña" autoComplete="new-password"
            style={{
              ...S.input,
              borderColor: confirm && confirm !== password ? "#F74F7B" : confirm && confirm === password ? "#34C78A" : "rgba(255,255,255,0.12)",
            }}
          />
        </div>
      </div>

      {error && error !== "EMAIL_EXISTS" && (
        <div style={{ ...S.error, marginTop: 4 }}>{error}</div>
      )}
      {error === "EMAIL_EXISTS" && (
        <div style={{ background: "rgba(247,135,79,0.12)", border: "1px solid rgba(247,135,79,0.3)", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#F7874F", marginTop: 4 }}>
          Este email ya está registrado.{" "}
          <button onClick={onForgot} style={{ background: "none", border: "none", color: "#F7874F", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: 13, padding: 0 }}>
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      )}

      <button type="submit" disabled={loading} style={{ ...S.btn, opacity: loading ? 0.7 : 1 }}>
        {loading ? "Creando cuenta..." : "Crear cuenta →"}
      </button>

      <button type="button" onClick={onBack}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", padding: 0, marginTop: 16, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
      >← Volver</button>
    </form>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function RegisterPage() {
  const { isAuthenticated } = useAuth();
  const { isHydrated }      = useAuthStore();
  const navigate            = useNavigate();

  const [step,  setStep]  = useState<1 | 2>(1);
  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => { initCsrf(); }, []);
  useEffect(() => {
    if (isHydrated && isAuthenticated) navigate("/home", { replace: true });
  }, [isHydrated, isAuthenticated, navigate]);

  return (
    <>
      <Helmet>
        <title>Crear cuenta — FamilyHub</title>
        <meta name="description" content="Crea tu cuenta y empieza a organizar tu hogar familiar." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:focus { border-color: #4F7BF7 !important; }
      `}</style>
      <div style={S.bg}>
        <div style={S.card}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#4F7BF7,#A44FF7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
            <span style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>FamilyHub</span>
          </div>

          {step === 1 && (
            <StepInfo onNext={(n, e) => { setName(n); setEmail(e); setStep(2); }} />
          )}
          {step === 2 && (
            <StepPassword
              name={name} email={email}
              onBack={() => setStep(1)}
              onDone={() => navigate("/verify", { state: { email }, replace: true })}
              onForgot={() => navigate("/forgot-password")}
            />
          )}

          <p style={{ marginTop: 24, fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
            ¿Ya tienes cuenta?{" "}
            <button onClick={() => navigate("/login")}
              style={{ background: "none", border: "none", color: "#4F7BF7", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
            >Inicia sesión</button>
          </p>
        </div>
      </div>
    </>
  );
}
