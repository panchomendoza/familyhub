import type { ReactNode } from "react";
import styles from "./DashboardLayout.module.css";

interface DashboardLayoutProps {
  /** Background para el wrapper raíz. Permite override por dashboard. */
  bg?:            string;
  isDesktop:      boolean;
  drawerOpen:     boolean;
  onOpenDrawer:   () => void;
  onCloseDrawer:  () => void;
  /** Contenido del panel lateral (shared entre desktop y drawer móvil). */
  sidebarContent: ReactNode;
  /** Contenido central del topbar móvil (entre hamburger y acciones). */
  mobileTitle:    ReactNode;
  /** Botones a la derecha del topbar móvil. */
  mobileActions?: ReactNode;
  /** Estilos extra específicos del dashboard (animaciones, etc.). */
  extraStyles?:   string;
  children:       ReactNode;
}

export function DashboardLayout({
  bg,
  isDesktop,
  drawerOpen,
  onOpenDrawer,
  onCloseDrawer,
  sidebarContent,
  mobileTitle,
  mobileActions,
  extraStyles = "",
  children,
}: DashboardLayoutProps) {
  return (
    <>
      {extraStyles && <style>{extraStyles}</style>}

      <div className={styles.root} style={bg ? { background: bg } : undefined}>

        {/* ── Sidebar desktop ── */}
        {isDesktop && (
          <aside className={styles.sidebar}>
            {sidebarContent}
          </aside>
        )}

        {/* ── Drawer móvil ── */}
        {!isDesktop && drawerOpen && (
          <div className={styles.drawerBackdrop}>
            <div className={styles.drawerPanel}>
              {sidebarContent}
            </div>
            <div className={styles.drawerOverlay} onClick={onCloseDrawer} />
          </div>
        )}

        {/* ── Contenido principal ── */}
        <main className={styles.main}>

          {/* Topbar móvil */}
          {!isDesktop && (
            <header className={styles.topbar}>
              <button
                className={styles.topbarMenu}
                onClick={onOpenDrawer}
                aria-label="Abrir menú"
              >
                ☰
              </button>

              {mobileTitle}

              <div className={styles.topbarActions}>
                {mobileActions}
              </div>
            </header>
          )}

          {children}
        </main>
      </div>
    </>
  );
}
