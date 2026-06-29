/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Client ID público de Google OAuth 2.0 — obtenido en Google Cloud Console */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // ── Feature flags (ausente o "true" = activo; "false" = desactivado) ──
  readonly VITE_FEATURE_GOOGLE_LOGIN?:        string;
  readonly VITE_FEATURE_REGISTER?:            string;
  readonly VITE_FEATURE_FORGOT_PASSWORD?:     string;
  readonly VITE_FEATURE_DASHBOARD_HEALTH?:    string;
  readonly VITE_FEATURE_DASHBOARD_STOCK?:     string;
  readonly VITE_FEATURE_DASHBOARD_EXPENSES?:  string;
  readonly VITE_FEATURE_DASHBOARD_VEHICLES?:  string;
  readonly VITE_FEATURE_DASHBOARD_TASKS?:     string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
