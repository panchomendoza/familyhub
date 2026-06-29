/**
 * Feature flags — controlados por variables de entorno.
 * Todo está ACTIVADO por defecto. Para desactivar, setear la variable a "false".
 *
 * Ejemplo en .env.local:
 *   VITE_FEATURE_GOOGLE_LOGIN=false
 *   VITE_FEATURE_REGISTER=false
 *   VITE_FEATURE_FORGOT_PASSWORD=false
 *   VITE_FEATURE_DASHBOARD_HEALTH=false
 *   VITE_FEATURE_DASHBOARD_STOCK=false
 *   VITE_FEATURE_DASHBOARD_EXPENSES=false
 *   VITE_FEATURE_DASHBOARD_VEHICLES=false
 *   VITE_FEATURE_DASHBOARD_TASKS=false
 */
const flag = (key: string) => import.meta.env[key] !== "false";

export const features = {
  // Auth
  googleLogin:    flag("VITE_FEATURE_GOOGLE_LOGIN"),
  register:       flag("VITE_FEATURE_REGISTER"),
  forgotPassword: flag("VITE_FEATURE_FORGOT_PASSWORD"),

  // Dashboards
  dashboards: {
    health:   flag("VITE_FEATURE_DASHBOARD_HEALTH"),
    stock:    flag("VITE_FEATURE_DASHBOARD_STOCK"),
    expenses: flag("VITE_FEATURE_DASHBOARD_EXPENSES"),
    vehicles: flag("VITE_FEATURE_DASHBOARD_VEHICLES"),
    tasks:    flag("VITE_FEATURE_DASHBOARD_TASKS"),
  },
} as const;
