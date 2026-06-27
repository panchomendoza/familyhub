/**
 * Configuración centralizada de sesión.
 *
 * En local (development) se leen variables VITE_* del .env.local.
 * En producción/testing se usan los valores por defecto.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  Variable                │ Local (.env.local) │ Prod/Test (default)  │
 * ├──────────────────────────┼────────────────────┼──────────────────────┤
 * │  VITE_IDLE_TIMEOUT_MS    │ 10 000  (10s)      │ 300 000  (5min)      │
 * │  VITE_IDLE_WARN_S        │ 15                 │ 30                   │
 * │  VITE_SESSION_MAX_MS     │ 30 000  (30s)      │ 1 800 000 (30min)    │
 * │  VITE_SESSION_WARN_MS    │ 10 000  (10s)      │ 300 000  (5min)      │
 * │  VITE_SESSION_WARN_S     │ 15                 │ 60                   │
 * └──────────────────────────────────────────────────────────────────────┘
 */

function envNum(key: string, fallback: number): number {
  const v = import.meta.env[key];
  const n = Number(v);
  return v !== undefined && !isNaN(n) ? n : fallback;
}

export const SESSION_CONFIG = {
  // ── Inactividad ───────────────────────────────────────────────────────
  /** Milisegundos sin interacción antes de mostrar aviso de inactividad */
  IDLE_TIMEOUT_MS: envNum("VITE_IDLE_TIMEOUT_MS", 5 * 60 * 1000),
  /** Segundos de countdown en el modal de inactividad antes de cerrar */
  IDLE_WARN_S:     envNum("VITE_IDLE_WARN_S",     30),

  // ── Vida máxima de sesión ─────────────────────────────────────────────
  /** Duración máxima absoluta de la sesión en milisegundos */
  SESSION_MAX_MS:  envNum("VITE_SESSION_MAX_MS",  30 * 60 * 1000),
  /** Milisegundos antes de SESSION_MAX para mostrar aviso de expiración */
  SESSION_WARN_MS: envNum("VITE_SESSION_WARN_MS",  5 * 60 * 1000),
  /** Segundos de countdown en el modal de expiración antes de cerrar */
  SESSION_WARN_S:  envNum("VITE_SESSION_WARN_S",  60),

  // ── Interno ────────────────────────────────────────────────────────────
  /** Intervalo del tick principal en ms */
  TICK_MS: 2_000,
} as const;
