/**
 * Shared layout for all auth screens.
 * Dark gradient background with floating orbs and emoji decorations.
 */

import { useState } from "react";

export const AUTH_STYLES = `
  @keyframes floatA { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-14px) rotate(6deg)} }
  @keyframes floatB { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-10px) rotate(-5deg)} }
  @keyframes floatC { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin   { to{transform:rotate(360deg)} }
  *{box-sizing:border-box}
`;

const FLOATING_ICONS = [
  { icon: "🩺", top: "12%", left: "8%",  anim: "floatA 5s ease-in-out infinite",   size: 28, op: 0.3  },
  { icon: "🛒", top: "20%", right: "10%", anim: "floatB 7s ease-in-out infinite",   size: 24, op: 0.25 },
  { icon: "✅", top: "70%", left: "6%",   anim: "floatC 6s ease-in-out infinite",   size: 22, op: 0.22 },
  { icon: "💰", top: "75%", right: "8%",  anim: "floatA 8s ease-in-out infinite",   size: 26, op: 0.27 },
  { icon: "🏠", top: "45%", left: "4%",   anim: "floatB 5.5s ease-in-out infinite", size: 20, op: 0.18 },
];

export function AuthBg({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{AUTH_STYLES}</style>
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0F1B3D 0%, #1A1150 45%, #0D2640 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        padding: 20, position: "relative", overflow: "hidden",
      }}>
        {/* Orbes de fondo */}
        <div style={{ position: "absolute", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, #4F7BF722 0%, transparent 70%)", top: -80, left: -100, animation: "floatC 7s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, #A44FF718 0%, transparent 70%)", bottom: -60, right: -60, animation: "floatB 9s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, #34C78A15 0%, transparent 70%)", top: "40%", right: "8%", animation: "floatA 6s ease-in-out infinite" }} />

        {/* Emojis flotantes */}
        {FLOATING_ICONS.map((d, i) => (
          <div key={i} style={{ position: "absolute", top: d.top, left: d.left, right: (d as { right?: string }).right, fontSize: d.size, opacity: d.op, animation: d.anim, userSelect: "none", pointerEvents: "none" }}>
            {d.icon}
          </div>
        ))}

        {/* Contenido */}
        <div style={{ width: "100%", maxWidth: 440, animation: "fadeUp 0.5s ease both", position: "relative", zIndex: 1 }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, margin: "0 auto 14px", background: "linear-gradient(135deg, #4F7BF7, #A44FF7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: "0 8px 32px #4F7BF740" }}>🏠</div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>Centro Familiar</h1>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#8899CC" }}>Tu hogar, todo organizado</p>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

/** Glass card */
export function AuthCard({ children, title, subtitle }: {
  children: React.ReactNode; title?: string; subtitle?: string;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.06)", backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 24, padding: "32px 28px",
    }}>
      {title    && <p style={{ margin: "0 0 6px",  fontSize: 18, fontWeight: 700, color: "#fff" }}>{title}</p>}
      {subtitle && <p style={{ margin: "0 0 24px", fontSize: 13, color: "#8899CC" }}>{subtitle}</p>}
      {children}
    </div>
  );
}

/** Input field */
export function AuthInput({ label, type = "text", placeholder, value, onChange, onKeyDown, icon, autoComplete, disabled }: {
  label?: string; type?: string; placeholder?: string;
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  icon?: string; autoComplete?: string; disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 700, color: "#8899CC", letterSpacing: 0.4, display: "block", marginBottom: 5 }}>{label}</label>}
      <div style={{ position: "relative" }}>
        {icon && <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, opacity: 0.5, pointerEvents: "none" }}>{icon}</span>}
        <input
          type={isPass ? (showPass ? "text" : "password") : type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete={autoComplete}
          disabled={disabled}
          style={{
            width: "100%",
            padding: `13px ${isPass ? "44px" : "16px"} 13px ${icon ? "42px" : "16px"}`,
            borderRadius: 12,
            border: `1.5px solid ${focused ? "#4F7BF7" : "rgba(255,255,255,0.12)"}`,
            fontFamily: "inherit", fontSize: 14, color: "#E8EEFF",
            outline: "none", background: focused ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
            transition: "border-color 0.18s, background 0.18s", boxSizing: "border-box",
            opacity: disabled ? 0.5 : 1,
          }}
        />
        {isPass && (
          <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15, opacity: 0.5, padding: 4 }}>
            {showPass ? "🙈" : "👁"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Primary button */
export function AuthBtn({ onClick, type = "button", loading, disabled, children, color = "#4F7BF7" }: {
  onClick?: () => void; type?: "button" | "submit";
  loading?: boolean; disabled?: boolean; children: React.ReactNode; color?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={loading || disabled} style={{
      width: "100%", padding: "14px", borderRadius: 12, border: "none",
      background: (loading || disabled) ? color + "88" : color, color: "#fff",
      fontFamily: "inherit", fontWeight: 700, fontSize: 15,
      cursor: (loading || disabled) ? "default" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      transition: "background 0.18s, transform 0.14s",
    }}
      onMouseEnter={e => { if (!loading && !disabled) e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}
    >
      {loading
        ? <><span style={{ width: 16, height: 16, border: "2px solid #ffffff44", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} /> Procesando...</>
        : children}
    </button>
  );
}

/** Error banner */
export function AuthError({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return (
    <div style={{ marginBottom: 16, padding: "10px 14px", background: "#F74F7B18", border: "1px solid #F74F7B30", borderRadius: 10, fontSize: 13, color: "#FF7BA8", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
      ⚠️ {msg}
    </div>
  );
}

/** Success banner */
export function AuthSuccess({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return (
    <div style={{ marginBottom: 16, padding: "10px 14px", background: "#34C78A18", border: "1px solid #34C78A30", borderRadius: 10, fontSize: 13, color: "#34C78A", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
      ✓ {msg}
    </div>
  );
}

/** Divider "o continúa con" */
export function AuthDivider({ label = "o continúa con" }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
      <span style={{ fontSize: 12, color: "#8899CC" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
    </div>
  );
}

/** Google button */
export function GoogleBtn({
  onClick,
  disabled,
  loading = false,
}: {
  onClick?:  () => void;
  disabled?: boolean;
  loading?:  boolean;
}) {
  const busy = disabled || loading;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        width: "100%", padding: "13px", borderRadius: 12,
        cursor: busy ? "not-allowed" : "pointer",
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.06)",
        color: "#fff", fontFamily: "inherit", fontWeight: 600, fontSize: 14,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        transition: "background 0.18s", opacity: busy ? 0.6 : 1,
      }}
      onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
    >
      {loading ? (
        <span style={{
          display: "inline-block", width: 18, height: 18, borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
          animation: "spin 0.7s linear infinite", flexShrink: 0,
        }} />
      ) : (
        <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
          <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3-11.3-7.5l-6.6 5.1C9.8 40.1 16.4 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.2 5.2C40.7 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
        </svg>
      )}
      {loading ? "Iniciando sesión…" : "Continuar con Google"}
    </button>
  );
}

/** Inline link text */
export function AuthLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ background: "none", border: "none", color: "#4F7BF7", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
      {label}
    </button>
  );
}
