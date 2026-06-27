import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";

// ── Estilos compartidos con otras páginas auth ──────────────────────────────
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
  logo: {
    display: "flex", alignItems: "center", gap: 10, marginBottom: 28,
  } as React.CSSProperties,
  title: {
    fontSize: 22, fontWeight: 800, color: "#fff", margin: 0,
  } as React.CSSProperties,
  subtitle: {
    fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6, lineHeight: 1.5,
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
  back: {
    background: "none", border: "none", color: "rgba(255,255,255,0.4)",
    fontSize: 13, cursor: "pointer", padding: 0, marginTop: 18,
    fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
  } as React.CSSProperties,
};

// ── Indicador de pasos ───────────────────────────────────────────────────────
function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
      {[1, 2, 3].map(n => (
        <div key={n} style={{
          height: 4, flex: n === step ? 2 : 1, borderRadius: 99,
          background: n <= step ? "#4F7BF7" : "rgba(255,255,255,0.15)",
          transition: "all 0.3s ease",
        }} />
      ))}
    </div>
  );
}

// ── Step 1: Email ────────────────────────────────────────────────────────────
function StepEmail({ onNext }: { onNext: (email: string) => void }) {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Ingresa tu email"); return; }
    if (!email.includes("@")) { setError("Ingresa un email válido"); return; }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
    } catch {
      // El backend siempre responde 200 — ignoramos cualquier error de red
    } finally {
      setLoading(false);
      onNext(email.trim().toLowerCase());
    }
  }

  return (
    <form onSubmit={submit}>
      <StepDots step={1} />
      <h1 style={S.title}>¿Olvidaste tu contraseña?</h1>
      <p style={S.subtitle}>
        Ingresa tu email y te enviaremos un código de verificación.
      </p>

      <div style={{ marginTop: 24 }}>
        <label style={S.label}>EMAIL</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="tu@email.com"
          autoFocus
          style={S.input}
        />
      </div>

      {error && <div style={{ ...S.error, marginTop: 12 }}>{error}</div>}

      <button type="submit" disabled={loading} style={{ ...S.btn, opacity: loading ? 0.7 : 1 }}>
        {loading ? "Enviando..." : "Enviar código →"}
      </button>
    </form>
  );
}

// ── Step 2: Código OTP ───────────────────────────────────────────────────────
const OTP_LEN = 6;

function StepCode({
  email,
  onNext,
  onBack,
}: {
  email:  string;
  onNext: (resetToken: string) => void;
  onBack: () => void;
}) {
  const [digits,  setDigits]  = useState<string[]>(Array(OTP_LEN).fill(""));
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [resent,  setResent]  = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  function handleChange(i: number, val: string) {
    const char = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = char;
    setDigits(next);
    if (char && i < OTP_LEN - 1) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LEN);
    if (pasted.length === OTP_LEN) {
      e.preventDefault();
      setDigits(pasted.split(""));
      refs.current[OTP_LEN - 1]?.focus();
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length < OTP_LEN) { setError("Ingresa los 6 dígitos"); return; }
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post<{ resetToken: string }>("/auth/verify-reset-code", { email, code });
      onNext(data.resetToken);
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Código incorrecto";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResent(false);
    await api.post("/auth/forgot-password", { email }).catch(() => {});
    setDigits(Array(OTP_LEN).fill(""));
    setError("");
    setResent(true);
    refs.current[0]?.focus();
  }

  return (
    <form onSubmit={submit}>
      <StepDots step={2} />

      {/* Banner "revisa tu bandeja" */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        background: "rgba(79,123,247,0.10)", border: "1px solid rgba(79,123,247,0.25)",
        borderRadius: 12, padding: "12px 14px", marginBottom: 20,
      }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>📬</span>
        <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
          Si <strong style={{ color: "rgba(255,255,255,0.85)" }}>{email}</strong> está registrado,
          te enviamos un código. Revisa tu bandeja de entrada (y el spam).
        </p>
      </div>

      <h1 style={{ ...S.title, fontSize: 18, marginBottom: 4 }}>Ingresa el código</h1>
      <p style={{ ...S.subtitle, marginBottom: 0 }}>6 dígitos · válido por 15 minutos</p>

      {/* Inputs OTP */}
      <div style={{ display: "flex", gap: 8, marginTop: 24, justifyContent: "center" }} onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { refs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            style={{
              width: 44, height: 52, textAlign: "center", fontSize: 22,
              fontWeight: 800, borderRadius: 10, fontFamily: "monospace",
              background: d ? "rgba(79,123,247,0.15)" : "rgba(255,255,255,0.06)",
              border: `1.5px solid ${d ? "#4F7BF7" : "rgba(255,255,255,0.12)"}`,
              color: "#fff", outline: "none", transition: "all 0.15s",
            }}
          />
        ))}
      </div>

      {error && <div style={{ ...S.error, marginTop: 16 }}>{error}</div>}
      {resent && (
        <div style={{ background: "rgba(52,199,138,0.12)", border: "1px solid rgba(52,199,138,0.3)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#34C78A", marginTop: 12 }}>
          ✓ Código reenviado
        </div>
      )}

      <button type="submit" disabled={loading} style={{ ...S.btn, opacity: loading ? 0.7 : 1 }}>
        {loading ? "Verificando..." : "Verificar código →"}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button type="button" onClick={onBack} style={S.back}>← Volver</button>
        <button type="button" onClick={resend} style={{ ...S.back, color: "#4F7BF7" }}>
          Reenviar código
        </button>
      </div>
    </form>
  );
}

// ── Step 3: Nueva contraseña ─────────────────────────────────────────────────
function StepPassword({
  resetToken,
  onDone,
}: {
  resetToken: string;
  onDone: () => void;
}) {
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPwd,   setShowPwd]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const strength = password.length >= 12 && /[A-Z]/.test(password) && /\d/.test(password)
    ? "fuerte" : password.length >= 8 ? "media" : password.length > 0 ? "débil" : null;
  const strengthColor = strength === "fuerte" ? "#34C78A" : strength === "media" ? "#F7874F" : "#F74F7B";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8)       { setError("Mínimo 8 caracteres"); return; }
    if (password !== confirm)      { setError("Las contraseñas no coinciden"); return; }
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { resetToken, password });
      onDone();
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Error al cambiar contraseña";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <StepDots step={3} />
      <h1 style={S.title}>Nueva contraseña</h1>
      <p style={S.subtitle}>Elige una contraseña segura para tu cuenta.</p>

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={S.label}>NUEVA CONTRASEÑA</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoFocus
              style={{ ...S.input, paddingRight: 42 }}
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "rgba(255,255,255,0.4)", padding: 0 }}
            >{showPwd ? "🙈" : "👁️"}</button>
          </div>
          {strength && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, height: 3, borderRadius: 99, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: strengthColor, width: strength === "fuerte" ? "100%" : strength === "media" ? "60%" : "25%", transition: "width 0.3s, background 0.3s" }} />
              </div>
              <span style={{ fontSize: 11, color: strengthColor, fontWeight: 700 }}>{strength}</span>
            </div>
          )}
        </div>

        <div>
          <label style={S.label}>CONFIRMAR CONTRASEÑA</label>
          <input
            type={showPwd ? "text" : "password"}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repite tu contraseña"
            style={{
              ...S.input,
              borderColor: confirm && confirm !== password ? "#F74F7B" : confirm && confirm === password ? "#34C78A" : "rgba(255,255,255,0.12)",
            }}
          />
        </div>
      </div>

      {error && <div style={{ ...S.error, marginTop: 4 }}>{error}</div>}

      <button type="submit" disabled={loading} style={{ ...S.btn, opacity: loading ? 0.7 : 1 }}>
        {loading ? "Guardando..." : "Cambiar contraseña →"}
      </button>
    </form>
  );
}

// ── Step 4: Éxito ────────────────────────────────────────────────────────────
function StepSuccess({ onLogin }: { onLogin: () => void }) {
  useEffect(() => {
    const t = setTimeout(onLogin, 3000);
    return () => clearTimeout(t);
  }, [onLogin]);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
      <h1 style={S.title}>¡Contraseña cambiada!</h1>
      <p style={{ ...S.subtitle, marginTop: 10 }}>
        Tu contraseña fue actualizada correctamente.<br />
        Redirigiendo al inicio de sesión...
      </p>
      <button onClick={onLogin} style={{ ...S.btn, marginTop: 24 }}>
        Ir al login
      </button>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function ForgotPasswordPage() {
  const navigate    = useNavigate();
  const store       = useAuthStore();
  const queryClient = useQueryClient();

  const [step,       setStep]       = useState<1 | 2 | 3 | "done">(1);
  const [email,      setEmail]      = useState("");
  const [resetToken, setResetToken] = useState("");

  // Si ya está autenticado, no necesita recuperar contraseña
  useEffect(() => {
    if (store.isHydrated && store.user) navigate("/home", { replace: true });
  }, [store.isHydrated, store.user, navigate]);

  // Al terminar el flujo: limpiar store + cache (el backend ya invalidó la sesión)
  function goToLogin() {
    store.logout();
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <Helmet>
        <title>Recuperar contraseña — FamilyHub</title>
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
          <div style={S.logo}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#4F7BF7,#A44FF7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
            <span style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>FamilyHub</span>
          </div>

          {step === 1 && (
            <StepEmail onNext={em => { setEmail(em); setStep(2); }} />
          )}
          {step === 2 && (
            <StepCode
              email={email}
              onNext={token => { setResetToken(token); setStep(3); }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepPassword
              resetToken={resetToken}
              onDone={() => setStep("done")}
            />
          )}
          {step === "done" && (
            <StepSuccess onLogin={goToLogin} />
          )}

          {step !== "done" && (
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <button onClick={() => navigate("/login")} style={{ ...S.back, justifyContent: "center", width: "100%" }}>
                ← Volver al login
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
