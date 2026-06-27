import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { api, type ApiError } from "@/lib/api";
import { AuthBg, AuthCard, AuthError, AuthBtn, AuthLink, AUTH_STYLES } from "./AuthLayout";

interface ErrBody { error?: string; message?: string }

const CODE_LENGTH     = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const emailFromState = (location.state as { email?: string })?.email ?? "";

  const [email,     setEmail]     = useState(emailFromState);
  const [digits,    setDigits]    = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown,  setCooldown]  = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(CODE_LENGTH).fill(null));

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const code = digits.join("");
  const handleVerify = useCallback(async (codeToVerify: string) => {
    if (!email) { setError("No se encontró el email. Vuelve a registrarte."); return; }
    setError(null); setLoading(true);
    try {
      await api.post("/auth/verify-email", { email, code: codeToVerify });
      setSuccess(true);
      setTimeout(() => navigate("/login", { state: { verified: true } }), 2000);
    } catch (err) {
      const data = (err as ApiError<ErrBody>).data;
      setError(data?.error ?? "Código incorrecto o expirado.");
      setDigits(Array(CODE_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally { setLoading(false); }
  }, [email, navigate]);

  useEffect(() => {
    if (code.length === CODE_LENGTH && !loading) handleVerify(code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function handleDigitChange(index: number, value: string) {
    const pasted = value.replace(/\D/g, "");
    if (pasted.length > 1) {
      const next = [...digits];
      pasted.slice(0, CODE_LENGTH).split("").forEach((d, i) => {
        if (index + i < CODE_LENGTH) next[index + i] = d;
      });
      setDigits(next);
      inputRefs.current[Math.min(index + pasted.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    const digit = pasted.slice(-1);
    const next  = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits]; next[index] = ""; setDigits(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const next = [...digits]; next[index - 1] = ""; setDigits(next);
      }
    } else if (e.key === "ArrowLeft"  && index > 0)              inputRefs.current[index - 1]?.focus();
    else if   (e.key === "ArrowRight" && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  async function handleResend() {
    if (cooldown > 0 || resending || !email) return;
    setResending(true); setError(null);
    try {
      await api.post("/auth/resend-verification", { email });
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      const data = (err as ApiError<ErrBody>).data;
      setError(data?.error ?? "No se pudo reenviar el código.");
    } finally { setResending(false); }
  }

  // Pantalla de éxito
  if (success) {
    return (
      <>
        <Helmet>
          <title>Verificar email — FamilyHub</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <style>{AUTH_STYLES}</style>
        <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0F1B3D 0%, #1A1150 45%, #0D2640 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
          <div style={{ textAlign: "center", animation: "fadeUp 0.4s ease both" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>¡Email verificado!</h2>
            <p style={{ fontSize: 14, color: "#8899CC", margin: 0 }}>Redirigiendo al inicio de sesión…</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <AuthBg>
      <AuthCard title="Verifica tu email" subtitle={`Ingresa el código de 6 dígitos que enviamos a ${email || "tu correo"}`}>

        {/* Si no tiene email en state, mostrar campo */}
        {!emailFromState && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#8899CC", display: "block", marginBottom: 5 }}>TU EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#E8EEFF", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        )}

        <AuthError msg={error} />

        {/* Celdas del código */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={digit}
              onChange={e => handleDigitChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              onFocus={e => e.target.select()}
              disabled={loading}
              style={{
                width: 44, height: 52, textAlign: "center", fontSize: 22, fontWeight: 800,
                borderRadius: 10,
                border: `2px solid ${digit ? "#4F7BF7" : "rgba(255,255,255,0.15)"}`,
                background: digit ? "rgba(79,123,247,0.15)" : "rgba(255,255,255,0.04)",
                color: "#fff", fontFamily: "inherit", outline: "none",
                transition: "border-color 0.15s, background 0.15s",
                opacity: loading ? 0.5 : 1,
              }}
            />
          ))}
        </div>

        {/* Verificando... */}
        {loading && (
          <div style={{ textAlign: "center", marginBottom: 16, color: "#8899CC", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ width: 14, height: 14, border: "2px solid #8899CC44", borderTopColor: "#8899CC", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
            Verificando...
          </div>
        )}

        {/* Botón manual si no auto-submitió */}
        {!loading && code.length === CODE_LENGTH && (
          <div style={{ marginBottom: 16 }}>
            <AuthBtn onClick={() => handleVerify(code)}>Verificar →</AuthBtn>
          </div>
        )}

        {/* Reenviar */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "#5566AA", margin: "0 0 4px" }}>¿No te llegó el código?</p>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resending || !email}
            style={{ background: "none", border: "none", color: cooldown > 0 ? "#3A4560" : "#4F7BF7", fontWeight: 700, cursor: cooldown > 0 ? "default" : "pointer", fontSize: 13, fontFamily: "inherit" }}
          >
            {resending ? "Enviando…" : cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar código"}
          </button>
        </div>

        <p style={{ marginTop: 16, fontSize: 12, color: "#5566AA", textAlign: "center" }}>
          <AuthLink label="← Volver al registro" onClick={() => navigate("/register")} />
        </p>
      </AuthCard>
    </AuthBg>
  );
}
