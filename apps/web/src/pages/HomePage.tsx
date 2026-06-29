import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/auth.store";
import { useTheme } from "@/lib/theme";
import { useWindowWidth } from "@/hooks/useWindowWidth";
import { HomePageSkeleton } from "@/components/ui/DashboardSkeletons";
import { api } from "@/lib/api";
import { features } from "@/config/features";
import type { Family, DashboardId } from "@familyhub/types";

/* CSS vars como strings — usado en inline styles de todos los sub-componentes */
const V = {
  bg:         "var(--bg)",
  surface:    "var(--surface)",
  surfaceAlt: "var(--surface-alt)",
  border:     "var(--border)",
  text:       "var(--text)",
  textMuted:  "var(--text-muted)",
  sidebarBg:  "var(--sidebar-bg)",
  cardShadow: "var(--card-shadow)",
};

/* ════════════════════════════════════
   Constantes
   ════════════════════════════════════ */

type DashboardDef = { id: DashboardId; path: string; emoji: string; title: string; description: string; color: string; comingSoon: boolean; enabled: boolean; };
const DASHBOARDS: DashboardDef[] = ([
  {
    id:          "health",
    path:        "/health",
    emoji:       "👶",
    title:       "Salud Hijos",
    description: "Controles médicos, vacunas, visitas y gráficos de crecimiento",
    color:       "#34C78A",
    comingSoon:  false,
    enabled:     features.dashboards.health,
  },
  {
    id:          "expenses",
    path:        "/expenses",
    emoji:       "💰",
    title:       "Gastos del Hogar",
    description: "Control mensual, cuotas, presupuesto 50/30/20 y análisis",
    color:       "#4F7BF7",
    comingSoon:  false,
    enabled:     features.dashboards.expenses,
  },
  {
    id:          "stock",
    path:        "/stock",
    emoji:       "📦",
    title:       "Stock del Hogar",
    description: "Inventario por categoría, escáner de barras y lista de compras",
    color:       "#F7874F",
    comingSoon:  false,
    enabled:     features.dashboards.stock,
  },
  {
    id:          "vehicles",
    path:        "/vehicles",
    emoji:       "🚗",
    title:       "Vehículos",
    description: "Bitácora de mantenciones, documentos, gastos y alertas por vehículo",
    color:       "#4F7BF7",
    comingSoon:  false,
    enabled:     features.dashboards.vehicles,
  },
  {
    id:          "tasks",
    path:        "/tasks",
    emoji:       "✅",
    title:       "Tareas del Hogar",
    description: "Organiza y asigna tareas domésticas a los miembros del hogar",
    color:       "#A44FF7",
    comingSoon:  true,
    enabled:     features.dashboards.tasks,
  },
] as DashboardDef[]).filter(d => d.enabled);

/* ════════════════════════════════════
   Componente principal
   ════════════════════════════════════ */

export default function HomePage() {
  const { user, logout } = useAuth();
  const { currentFamily, families, setCurrentFamily, isHydrated } = useAuthStore();
  const navigate = useNavigate();

  const { isDark, toggle: toggleTheme } = useTheme();
  const width    = useWindowWidth();
  const isMobile = width < 640;

  const [showFamilyMenu, setShowFamilyMenu] = useState(false);
  const [showUserMenu,   setShowUserMenu]   = useState(false);
  const [showInvite,     setShowInvite]     = useState(false);
  const [inviteCopied,   setInviteCopied]   = useState(false);
  const [savingMember,   setSavingMember]   = useState<string | null>(null);

  // Actualiza acceso a un dashboard para un miembro (toggle)
  const toggleDashboard = useCallback(async (memberId: string, current: DashboardId[], dashId: DashboardId) => {
    if (!currentFamily) return;
    setSavingMember(memberId);
    const next = current.includes(dashId)
      ? current.filter(d => d !== dashId)
      : [...current, dashId];
    try {
      await api.patch(`/families/${currentFamily.id}/members/${memberId}`, { dashboardAccess: next });
      // Actualizar store local sin refetch
      setCurrentFamily({
        ...currentFamily,
        members: currentFamily.members.map(m =>
          m.id === memberId ? { ...m, dashboardAccess: next } : m
        ),
      });
    } catch { /* silencioso, el toggle vuelve al estado original */ }
    finally { setSavingMember(null); }
  }, [currentFamily, setCurrentFamily]);

  if (!isHydrated || !currentFamily || !user) {
    return (
      <div style={{ minHeight: "100vh", background: isDark ? "#111827" : "#f8fafc", padding: "24px 20px" }}>
        <HomePageSkeleton dark={isDark} />
      </div>
    );
  }

  const myMember = currentFamily.members.find((m) => m.userId === user.id);
  const isAdmin  = myMember?.role === "admin";
  const access   = myMember?.dashboardAccess ?? [];
  const firstName = user.name?.split(" ")[0] ?? user.name ?? user.email;

  function canAccess(dashId: string): boolean {
    return isAdmin || access.includes(dashId as typeof access[number]);
  }

  function handleDashboard(path: string, dashId: string, comingSoon: boolean) {
    if (comingSoon || !canAccess(dashId)) return;
    navigate(path);
  }

  function switchFamily(family: Family) {
    setCurrentFamily(family);
    setShowFamilyMenu(false);
  }

  async function copyInviteCode() {
    await navigator.clipboard.writeText(currentFamily!.inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  async function handleLogout() {
    setShowUserMenu(false);
    await logout();
  }

  return (
    <>
      <style>{`
        *{box-sizing:border-box}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .dash-card{transition:transform 0.15s,box-shadow 0.15s}
        .dash-card:hover{transform:translateY(-2px);box-shadow:0 8px 28px #00000018!important}
        .dash-card:active{transform:translateY(0)}
      `}</style>

      <div style={{ minHeight: "100vh", background: V.bg, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: V.text }}>

        {/* ── Topbar ── */}
        <nav style={{ position: "sticky", top: 0, zIndex: 50, background: V.sidebarBg, borderBottom: `1.5px solid ${V.border}`, boxShadow: V.cardShadow }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "0 12px" : "0 20px", height: 58, display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 16, color: V.text, flexShrink: 0 }}>
              <span style={{ fontSize: 22 }}>🏠</span>
              {!isMobile && <span>Centro Familiar</span>}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: isMobile ? 6 : 8 }}>
              {/* Selector de familia */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => { setShowFamilyMenu(v => !v); setShowUserMenu(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "6px 10px" : "6px 12px", borderRadius: 9, background: V.surfaceAlt, border: `1.5px solid ${V.border}`, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: V.text, maxWidth: isMobile ? 130 : 180 }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>🏠</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentFamily.name}</span>
                  <span style={{ color: V.textMuted, fontSize: 11, flexShrink: 0 }}>▾</span>
                </button>
                {showFamilyMenu && (
                  <FamilyDropdown families={families} current={currentFamily}
                    onSelect={switchFamily}
                    onAdd={() => { setShowFamilyMenu(false); navigate("/onboarding"); }}
                    onClose={() => setShowFamilyMenu(false)} />
                )}
              </div>

              {/* Toggle tema */}
              <button onClick={toggleTheme} style={{ background: V.surfaceAlt, border: `1.5px solid ${V.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 15, flexShrink: 0 }}>
                {isDark ? "☀️" : "🌙"}
              </button>

              {/* Avatar */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => { setShowUserMenu(v => !v); setShowFamilyMenu(false); }}
                  style={{ width: 34, height: 34, borderRadius: "50%", background: "#4F7BF7", color: "#fff", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  aria-label="Menú de usuario"
                >
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
                    : (user.name?.charAt(0)?.toUpperCase() ?? "?")}
                </button>
                {showUserMenu && (
                  <UserDropdown user={user} isAdmin={isAdmin}
                    onProfile={() => { setShowUserMenu(false); navigate("/profile"); }}
                    onInvite={() => { setShowUserMenu(false); setShowInvite(true); }}
                    onLogout={handleLogout}
                    onClose={() => setShowUserMenu(false)} />
                )}
              </div>

              {/* Salir — solo en desktop; en móvil está en el menú de avatar */}
              {!isMobile && (
                <button
                  onClick={handleLogout}
                  style={{ background: "#F74F7B18", border: "1.5px solid #F74F7B30", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#F74F7B" }}
                >
                  Salir
                </button>
              )}
            </div>
          </div>
        </nav>

        {/* ── Contenido ── */}
        <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 48px" }}>

          {/* Bienvenida */}
          <div style={{ marginBottom: 28, animation: "fadeIn 0.3s ease" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: V.text, margin: 0 }}>
              Hola, {firstName} 👋
            </h1>
            <p style={{ fontSize: 13, color: V.textMuted, margin: "4px 0 0" }}>
              {currentFamily.name} — Viendo dashboards de tu hogar
            </p>
          </div>

          {/* Grid de dashboards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: 16, marginBottom: 32 }}>
            {DASHBOARDS.map(dash => {
              const allowed = canAccess(dash.id);
              return (
                <DashboardCard
                  key={dash.id}
                  {...dash}
                  allowed={allowed}
                  onClick={() => handleDashboard(dash.path, dash.id, dash.comingSoon)}
                />
              );
            })}
          </div>

          {/* Panel miembros (admin) */}
          {isAdmin && (
            <div style={{ background: V.surface, borderRadius: 18, border: `1.5px solid ${V.border}`, padding: "20px 22px", boxShadow: V.cardShadow, animation: "fadeIn 0.35s ease" }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: V.textMuted, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 6 }}>
                <span>👥</span> Miembros del hogar
              </h2>

              {/* Cabecera de permisos */}
              <div style={{ display: "grid", gridTemplateColumns: `1fr repeat(${DASHBOARDS.filter(d => !d.comingSoon).length},44px)`, gap: 6, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${V.border}` }}>
                <div />
                {DASHBOARDS.filter(d => !d.comingSoon).map(d => (
                  <div key={d.id} style={{ textAlign: "center", fontSize: 17 }} title={d.title}>{d.emoji}</div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {currentFamily.members.map(m => {
                  const isSelf  = m.userId === user.id;
                  const isAdm   = m.role === "admin";
                  const mAccess = m.dashboardAccess as DashboardId[];
                  const saving  = savingMember === m.id;
                  return (
                    <div key={m.userId} style={{ display: "grid", gridTemplateColumns: `1fr repeat(${DASHBOARDS.filter(d => !d.comingSoon).length},44px)`, gap: 6, alignItems: "center" }}>
                      {/* Info miembro */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: isAdm ? "#4F7BF718" : V.surfaceAlt, color: isAdm ? "#4F7BF7" : V.textMuted, fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1.5px solid ${isAdm ? "#4F7BF730" : V.border}` }}>
                          {m.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: V.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.name}{isSelf && <span style={{ marginLeft: 5, fontSize: 10, color: V.textMuted }}>(tú)</span>}
                          </div>
                          <div style={{ fontSize: 11, color: isAdm ? "#4F7BF7" : V.textMuted }}>{isAdm ? "Admin" : "Miembro"}</div>
                        </div>
                      </div>

                      {/* Toggles por dashboard */}
                      {DASHBOARDS.filter(d => !d.comingSoon).map(d => {
                        const hasAccess = isAdm || mAccess.includes(d.id);
                        const canToggle = !isAdm && !isSelf; // admin siempre tiene todo; no te tocas a ti mismo
                        return (
                          <button
                            key={d.id}
                            disabled={!canToggle || saving}
                            onClick={() => canToggle && toggleDashboard(m.id, mAccess, d.id)}
                            title={!canToggle ? (isAdm ? "El admin siempre tiene acceso" : "No puedes editar tu propio acceso") : (hasAccess ? "Quitar acceso" : "Dar acceso")}
                            style={{
                              width: 32, height: 32, borderRadius: 8, border: "none",
                              background: hasAccess ? d.color + "22" : V.surfaceAlt,
                              color:      hasAccess ? d.color : V.border,
                              fontSize: 16, cursor: canToggle ? "pointer" : "default",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              margin: "0 auto",
                              opacity: saving ? 0.5 : 1,
                              transition: "background 0.15s, color 0.15s",
                            }}
                          >
                            {hasAccess ? "✓" : "✕"}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setShowInvite(true)}
                style={{ marginTop: 16, width: "100%", padding: "9px", borderRadius: 10, border: `1.5px dashed ${V.border}`, background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: V.textMuted, fontFamily: "inherit", transition: "color 0.15s, border-color 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#4F7BF7"; e.currentTarget.style.borderColor = "#4F7BF7"; }}
                onMouseLeave={e => { e.currentTarget.style.color = V.textMuted; e.currentTarget.style.borderColor = V.border; }}
              >
                + Invitar miembro
              </button>
            </div>
          )}
        </main>

        {/* ── Modal: código de invitación ── */}
        {showInvite && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#0008", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowInvite(false)}>
            <div style={{ background: V.surface, borderRadius: 18, padding: "24px 22px", maxWidth: 360, width: "100%", border: `1px solid ${V.border}`, boxShadow: "0 20px 60px #0005" }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: V.text, margin: "0 0 6px" }}>Código de invitación</h2>
              <p style={{ fontSize: 13, color: V.textMuted, margin: "0 0 18px" }}>
                Comparte este código para que alguien se una a <strong>{currentFamily.name}</strong>.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: V.surfaceAlt, borderRadius: 12, padding: "12px 16px", marginBottom: 14, border: `1px solid ${V.border}` }}>
                <span style={{ flex: 1, fontFamily: "monospace", fontSize: 22, fontWeight: 800, letterSpacing: "0.22em", textAlign: "center", color: V.text }}>{currentFamily.inviteCode}</span>
                <button onClick={copyInviteCode} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#4F7BF7", fontFamily: "inherit" }}>
                  {inviteCopied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
              <p style={{ fontSize: 11, color: V.textMuted, textAlign: "center", margin: "0 0 14px" }}>
                El código no expira hasta que lo regeneres.
              </p>
              <button onClick={() => setShowInvite(false)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: `1.5px solid ${V.border}`, background: V.surfaceAlt, cursor: "pointer", fontSize: 13, fontWeight: 600, color: V.textMuted, fontFamily: "inherit" }}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Overlay cierra menús */}
        {(showFamilyMenu || showUserMenu) && (
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => { setShowFamilyMenu(false); setShowUserMenu(false); }} />
        )}
      </div>
    </>
  );
}

/* ════════════════════════════════════
   Sub-componentes
   ════════════════════════════════════ */

function DashboardCard({ emoji, title, description, color, comingSoon, allowed, onClick }: {
  emoji: string; title: string; description: string;
  color: string; comingSoon: boolean; allowed: boolean;
  onClick: () => void;
}) {
  const isClickable = allowed && !comingSoon;
  return (
    <div
      className={isClickable ? "dash-card" : undefined}
      onClick={isClickable ? onClick : undefined}
      style={{
        background: V.surface,
        borderRadius: 16,
        border: `2px solid ${isClickable ? color + "28" : V.border}`,
        padding: "18px 20px",
        cursor: isClickable ? "pointer" : "default",
        opacity: !allowed && !comingSoon ? 0.55 : 1,
        boxShadow: V.cardShadow,
        display: "flex", alignItems: "flex-start", gap: 14,
        position: "relative",
      }}
    >
      {/* Icono */}
      <div style={{ width: 48, height: 48, borderRadius: 13, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, border: `1.5px solid ${color}28` }}>
        {emoji}
      </div>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: isClickable ? color : V.textMuted }}>{title}</span>

          {comingSoon && (
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: "#8A93A818", color: V.textMuted, border: `1px solid ${V.border}`, letterSpacing: "0.05em" }}>PRÓXIMAMENTE</span>
          )}
          {!allowed && !comingSoon && (
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: "#F7874F14", color: "#F7874F", border: "1px solid #F7874F30", letterSpacing: "0.04em" }}>🔒 SIN ACCESO</span>
          )}
        </div>
        <p style={{ fontSize: 12, color: V.textMuted, margin: 0, lineHeight: 1.5 }}>{description}</p>
        {!allowed && !comingSoon && (
          <p style={{ fontSize: 11, color: "#F7874F", margin: "4px 0 0", fontStyle: "italic" }}>Contacta al administrador del hogar</p>
        )}
      </div>

      {/* Flecha */}
      {isClickable && (
        <span style={{ color, fontSize: 18, alignSelf: "center", flexShrink: 0, opacity: 0.5 }}>→</span>
      )}
    </div>
  );
}

function FamilyDropdown({ families, current, onSelect, onAdd, onClose }: {
  families: Family[]; current: Family;
  onSelect: (f: Family) => void; onAdd: () => void; onClose: () => void;
}) {
  void onClose;
  return (
    <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 100, width: 220, background: V.surface, borderRadius: 12, boxShadow: "0 8px 30px #00000018", border: `1.5px solid ${V.border}`, overflow: "hidden" }}>
      {families.map(f => (
        <button key={f.id} onClick={() => onSelect(f)} style={{
          width: "100%", textAlign: "left", padding: "10px 14px", background: "none",
          border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
          fontWeight: f.id === current.id ? 700 : 500,
          color: f.id === current.id ? "#4F7BF7" : current ? V.text : V.textMuted,
          display: "flex", alignItems: "center", gap: 8,
          borderLeft: f.id === current.id ? "3px solid #4F7BF7" : "3px solid transparent",
        }}>
          <span>🏠</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
          {f.id === current.id && <span style={{ fontSize: 12 }}>✓</span>}
        </button>
      ))}
      <div style={{ borderTop: `1.5px solid ${V.border}` }}>
        <button onClick={onAdd} style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#4F7BF7" }}>
          + Crear o unirse a otro hogar
        </button>
      </div>
    </div>
  );
}

function UserDropdown({ user, isAdmin, onProfile, onInvite, onLogout, onClose }: {
  user: { name: string; email: string };
  isAdmin: boolean;
  onProfile: () => void; onInvite: () => void; onLogout: () => void; onClose: () => void;
}) {
  void onClose;
  return (
    <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 100, width: 200, background: V.surface, borderRadius: 12, boxShadow: "0 8px 30px #00000018", border: `1.5px solid ${V.border}`, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1.5px solid ${V.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: V.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
        <div style={{ fontSize: 11, color: V.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
      </div>
      <button onClick={onProfile} style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: V.text, display: "flex", alignItems: "center", gap: 8 }}>
        👤 Mi perfil
      </button>
      {isAdmin && (
        <button onClick={onInvite} style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: V.text, display: "flex", alignItems: "center", gap: 8 }}>
          🔗 Invitar miembro
        </button>
      )}
      <button onClick={onLogout} style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "#F74F7B", display: "flex", alignItems: "center", gap: 8 }}>
        ↩ Cerrar sesión
      </button>
    </div>
  );
}
