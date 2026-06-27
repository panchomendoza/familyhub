import { useState } from "react";
import { useSessionManager } from "@/hooks/useSessionManager";
import { SESSION_CONFIG } from "@/lib/sessionConfig";

const V = {
  overlay:    "var(--overlay)",
  modalBg:    "var(--modal-bg)",
  borderLight:"var(--border-light)",
  text:       "var(--text)",
  textMuted:  "var(--text-muted)",
  textHint:   "var(--text-hint)",
  border:     "var(--border)",
  surfaceAlt: "var(--surface-alt)",
};

/**
 * Modal global de sesión — dos modos independientes:
 *  • Inactividad: "¿Sigues ahí?" con countdown
 *  • Expiración:  "Tu sesión expirará" con opción de renovar (una sola vez)
 *
 * Montar UNA vez en RootLayout.
 */
export function SessionWarningModal() {
  const {
    idleWarning, idleSecsLeft, onIdleContinue,
    expiryWarning, expirySecsLeft, renewalAllowed, onRenewSession, onSignOut,
    alreadyExpired, onAcknowledge,
  } = useSessionManager();
  const [renewing, setRenewing] = useState(false);

  // ── Modo: sesión ya expirada (descubierta al hacer petición) ─────────────
  if (alreadyExpired) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "var(--overlay)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        animation: "swFadeIn 0.2s ease",
      }}>
        <style>{`@keyframes swFadeIn{from{opacity:0}to{opacity:1}} @keyframes swSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{
          background: "var(--modal-bg)", borderRadius: 20,
          border: "1.5px solid #F74F7B40",
          boxShadow: "0 8px 40px #0008, 0 0 0 3px #F74F7B18",
          padding: "28px 28px 24px", maxWidth: 380, width: "100%",
          animation: "swSlideUp 0.25s ease", textAlign: "center",
        }}>
          <p style={{ margin: "0 0 10px", fontSize: 32 }}>🔒</p>
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
            Sesión expirada
          </p>
          <p style={{ margin: "0 0 22px", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Tu sesión ha expirado. Vuelve a iniciar sesión para continuar.
          </p>
          <button
            onClick={onAcknowledge}
            style={{
              width: "100%", padding: "11px", borderRadius: 10,
              border: "none", background: "#4F7BF7", color: "#fff",
              fontFamily: "inherit", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!idleWarning && !expiryWarning) return null;

  // Prioridad: si ambos se disparan a la vez, mostrar expiración (más crítico)
  const mode = expiryWarning ? "expiry" : "idle";

  const secsLeft    = mode === "expiry" ? expirySecsLeft : idleSecsLeft;
  const maxSecs     = mode === "expiry" ? SESSION_CONFIG.SESSION_WARN_S : SESSION_CONFIG.IDLE_WARN_S;
  const urgent      = secsLeft <= Math.min(10, Math.floor(maxSecs * 0.2));
  const accent      = mode === "expiry"
    ? (urgent ? "#F74F7B" : "#F7874F")   // naranja → rojo al urgente
    : (urgent ? "#F74F7B" : "#4F7BF7");  // azul → rojo al urgente
  const pct = Math.round((secsLeft / maxSecs) * 100);

  async function handleRenew() {
    setRenewing(true);
    await onRenewSession();
    setRenewing(false);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: V.overlay,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
      animation: "swFadeIn 0.2s ease",
    }}>
      <style>{`
        @keyframes swFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes swSlideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      <div style={{
        background: V.modalBg, borderRadius: 20,
        border:     `1.5px solid ${accent}40`,
        boxShadow:  `0 8px 40px #0008, 0 0 0 3px ${accent}18`,
        padding: "28px 28px 24px", maxWidth: 400, width: "100%",
        animation: "swSlideUp 0.25s ease", textAlign: "center",
      }}>
        {/* Countdown circular */}
        <div style={{ position: "relative", width: 76, height: 76, margin: "0 auto 20px" }}>
          <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="38" cy="38" r="32" fill="none" stroke={V.borderLight} strokeWidth="5" />
            <circle
              cx="38" cy="38" r="32" fill="none"
              stroke={accent} strokeWidth="5" strokeLinecap="round"
              strokeDasharray="201"
              strokeDashoffset={201 - (201 * pct) / 100}
              style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.4s" }}
            />
          </svg>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 19, fontWeight: 800, color: accent,
            fontVariantNumeric: "tabular-nums",
          }}>
            {secsLeft}
          </div>
        </div>

        {/* Ícono + título */}
        <p style={{ margin: "0 0 8px", fontSize: 26 }}>
          {mode === "expiry" ? "⏱️" : "💤"}
        </p>
        <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 16, color: V.text }}>
          {mode === "expiry" ? "Tu sesión está por vencer" : "¿Sigues ahí?"}
        </p>
        <p style={{ margin: "0 0 22px", fontSize: 13, color: V.textMuted, lineHeight: 1.6 }}>
          {mode === "expiry"
            ? renewalAllowed
              ? <>Tu sesión expira en <strong style={{ color: accent }}>{secsLeft}s</strong>.<br />¿Deseas renovarla por {SESSION_CONFIG.SESSION_MAX_MS / 60_000 < 1 ? `${SESSION_CONFIG.SESSION_MAX_MS / 1_000}s` : `${SESSION_CONFIG.SESSION_MAX_MS / 60_000} minutos`} más?</>
              : <>Tu sesión expira en <strong style={{ color: accent }}>{secsLeft}s</strong>.<br />No quedan renovaciones disponibles.</>
            : <>Has estado inactivo. Tu sesión se cerrará en <strong style={{ color: accent }}>{secsLeft}s</strong>.</>
          }
        </p>

        {/* Botones */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onSignOut}
            style={{
              flex: 1, padding: "10px", borderRadius: 10,
              border: `1.5px solid ${V.border}`,
              background: V.surfaceAlt, color: V.textMuted,
              fontFamily: "inherit", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}
          >
            Cerrar sesión
          </button>

          {mode === "idle" && (
            <button
              onClick={onIdleContinue}
              style={{
                flex: 2, padding: "10px", borderRadius: 10,
                border: "none", background: accent, color: "#fff",
                fontFamily: "inherit", fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}
            >
              ✓ Seguir aquí
            </button>
          )}

          {mode === "expiry" && renewalAllowed && (
            <button
              onClick={handleRenew}
              disabled={renewing}
              style={{
                flex: 2, padding: "10px", borderRadius: 10,
                border: "none",
                background: renewing ? accent + "80" : accent, color: "#fff",
                fontFamily: "inherit", fontWeight: 700, fontSize: 14,
                cursor: renewing ? "not-allowed" : "pointer",
              }}
            >
              {renewing ? "Renovando…" : "✓ Renovar sesión"}
            </button>
          )}
        </div>

        {mode === "expiry" && !renewalAllowed && (
          <p style={{ margin: "12px 0 0", fontSize: 11, color: V.textHint }}>
            Inicia sesión nuevamente para continuar.
          </p>
        )}
      </div>
    </div>
  );
}
