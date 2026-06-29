import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import s from "./ProfilePage.module.css";

export default function ProfilePage() {
  const { logout } = useAuth();
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();

  // ── Nombre ───────────────────────────────────────────────────────────────
  const [name, setName]           = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError]   = useState<string | null>(null);

  // ── Contraseña ───────────────────────────────────────────────────────────
  const [currentPwd, setCurrentPwd]     = useState("");
  const [newPwd, setNewPwd]             = useState("");
  const [confirmPwd, setConfirmPwd]     = useState("");
  const [savingPwd, setSavingPwd]       = useState(false);
  const [pwdSuccess, setPwdSuccess]     = useState(false);
  const [pwdError, setPwdError]         = useState<string | null>(null);

  if (!user) return null;

  const initial = user.name?.trim()?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "?";

  // ── Guardar nombre ───────────────────────────────────────────────────────
  async function handleSaveName() {
    if (name.trim().length < 2) { setNameError("El nombre debe tener al menos 2 caracteres."); return; }
    setNameError(null);
    setNameSuccess(false);
    setSavingName(true);
    try {
      const { data } = await api.patch<{ user: NonNullable<typeof user> }>("/auth/profile", { name: name.trim() });
      setUser(data.user);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      setNameError(msg ?? "Error al guardar. Intenta de nuevo.");
    } finally {
      setSavingName(false);
    }
  }

  // ── Cambiar contraseña ───────────────────────────────────────────────────
  async function handleSavePwd() {
    setPwdError(null);
    setPwdSuccess(false);
    if (!currentPwd) { setPwdError("Ingresa tu contraseña actual."); return; }
    if (newPwd.length < 8) { setPwdError("La nueva contraseña debe tener al menos 8 caracteres."); return; }
    if (newPwd !== confirmPwd) { setPwdError("Las contraseñas no coinciden."); return; }
    setSavingPwd(true);
    try {
      await api.patch("/auth/password", { currentPassword: currentPwd, newPassword: newPwd, confirmPassword: confirmPwd });
      setPwdSuccess(true);
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      setTimeout(() => setPwdSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      setPwdError(msg ?? "Error al cambiar contraseña. Intenta de nuevo.");
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className={s.page}>
      <Helmet>
        <title>Mi perfil — FamilyHub</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* ── Barra de navegación ── */}
      <nav className={s.nav}>
        <button className={s.backBtn} onClick={() => navigate(-1)}>
          ← Volver
        </button>
      </nav>

      <div className={s.content}>
        {/* ── Hero ── */}
        <div className={s.hero}>
          <div className={s.avatar}>
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt={user.name} />
              : initial}
          </div>
          <div className={s.heroInfo}>
            <div className={s.heroName}>{user.name}</div>
            <div className={s.heroEmail}>{user.email}</div>
            <div className={s.heroBadge}>
              {user.provider === "google" ? "🔵 Google" : "✉️ Email"}
            </div>
          </div>
        </div>

        {/* ── Información personal ── */}
        <div className={s.card}>
          <div className={s.cardTitle}>👤 Información personal</div>

          {nameSuccess && <div className={s.successBanner}>✓ Nombre actualizado.</div>}
          {nameError   && <div className={s.errorBanner}>{nameError}</div>}

          <div className={s.field}>
            <div className={s.label}>NOMBRE</div>
            <div className={s.inputRow}>
              <input
                className={s.input}
                value={name}
                onChange={e => { setName(e.target.value); setNameError(null); }}
                placeholder="Tu nombre"
                disabled={savingName}
                onKeyDown={e => e.key === "Enter" && handleSaveName()}
              />
              <button
                className={s.btnPrimary}
                onClick={handleSaveName}
                disabled={savingName || name.trim() === user.name}
              >
                {savingName ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>

          <div className={s.field}>
            <div className={s.label}>EMAIL</div>
            <input
              className={`${s.input} ${s.inputReadonly}`}
              value={user.email}
              readOnly
              disabled
            />
            <div className={s.hint}>El email no puede modificarse.</div>
          </div>
        </div>

        {/* ── Seguridad ── */}
        <div className={s.card}>
          <div className={s.cardTitle}>🔒 Seguridad</div>

          {user.provider === "email" ? (
            <>
              {pwdSuccess && <div className={s.successBanner}>✓ Contraseña actualizada correctamente.</div>}
              {pwdError   && <div className={s.errorBanner}>{pwdError}</div>}

              <div className={s.field}>
                <div className={s.label}>CONTRASEÑA ACTUAL</div>
                <input
                  className={s.input}
                  type="password"
                  placeholder="••••••••"
                  value={currentPwd}
                  onChange={e => { setCurrentPwd(e.target.value); setPwdError(null); }}
                  disabled={savingPwd}
                  autoComplete="current-password"
                />
              </div>
              <div className={s.field}>
                <div className={s.label}>NUEVA CONTRASEÑA</div>
                <input
                  className={s.input}
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={newPwd}
                  onChange={e => { setNewPwd(e.target.value); setPwdError(null); }}
                  disabled={savingPwd}
                  autoComplete="new-password"
                />
              </div>
              <div className={s.field}>
                <div className={s.label}>CONFIRMAR CONTRASEÑA</div>
                <input
                  className={s.input}
                  type="password"
                  placeholder="Repite la nueva contraseña"
                  value={confirmPwd}
                  onChange={e => { setConfirmPwd(e.target.value); setPwdError(null); }}
                  disabled={savingPwd}
                  autoComplete="new-password"
                  onKeyDown={e => e.key === "Enter" && handleSavePwd()}
                />
              </div>
              <button
                className={s.btnPrimary}
                onClick={handleSavePwd}
                disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd}
              >
                {savingPwd ? "Guardando..." : "Cambiar contraseña"}
              </button>
            </>
          ) : (
            <div className={s.googleNote}>
              <span style={{ fontSize: 18 }}>ℹ️</span>
              <span>
                Tu cuenta está vinculada a Google. Para cambiar tu contraseña, administra tu cuenta desde{" "}
                <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer"
                  style={{ color: "#4F7BF7", fontWeight: 700 }}>
                  Google Account
                </a>.
              </span>
            </div>
          )}
        </div>

        {/* ── Sesión ── */}
        <div className={s.card}>
          <div className={s.cardTitle}>🚪 Sesión</div>
          <div className={s.sessionRow}>
            <div>
              <div className={s.sessionLabel}>Cerrar sesión</div>
              <div className={s.sessionSub}>Se cerrará la sesión en este dispositivo.</div>
            </div>
            <button className={s.btnDanger} onClick={logout}>Salir</button>
          </div>
        </div>
      </div>
    </div>
  );
}
