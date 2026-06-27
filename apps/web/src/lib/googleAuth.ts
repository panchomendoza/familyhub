// ══════════════════════════════════════════════════════════════
//   Google Identity Services (GSI) — loader + tipos
//   https://developers.google.com/identity/gsi/web/reference/js-reference
// ══════════════════════════════════════════════════════════════

// ── Declaraciones globales ────────────────────────────────────

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize:        (config: GsiInitConfig) => void;
          prompt:            (callback?: (n: GsiPromptNotification) => void) => void;
          renderButton:      (parent: HTMLElement, options: GsiRenderButtonOptions) => void;
          cancel:            () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

// ── Tipos públicos ────────────────────────────────────────────

export interface GsiCredentialResponse {
  /** ID token JWT firmado por Google */
  credential: string;
}

export interface GsiPromptNotification {
  isNotDisplayed:        () => boolean;
  isSkippedMoment:       () => boolean;
  isDismissedMoment:     () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason:      () => string;
  getDismissedReason:    () => string;
}

export interface GsiRenderButtonOptions {
  theme?:         'outline' | 'filled_blue' | 'filled_black';
  size?:          'large' | 'medium' | 'small';
  text?:          'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  width?:         number;
  shape?:         'rectangular' | 'pill' | 'circle' | 'square';
  locale?:        string;
  logo_alignment?: 'left' | 'center';
}

interface GsiInitConfig {
  client_id:              string;
  callback:               (response: GsiCredentialResponse) => void;
  ux_mode?:               'popup' | 'redirect';
  auto_select?:           boolean;
  cancel_on_tap_outside?: boolean;
  context?:               'signin' | 'signup' | 'use';
  use_fedcm_for_prompt?:  boolean;
}

// ── Constante de entorno ─────────────────────────────────────

export const GOOGLE_CLIENT_ID =
  import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined;

// ── Carga del script GSI (singleton) ─────────────────────────

let gsiLoadPromise: Promise<void> | null = null;

// ── Inicialización GSI (singleton) ───────────────────────────
//   google.accounts.id.initialize() solo debe llamarse una vez.
//   Llamadas posteriores solo actualizan el callback activo.

let gsiInitialized = false;
let activeCredentialCallback: ((r: GsiCredentialResponse) => void) | null = null;

/** Callback maestro que delega al componente actualmente montado */
function masterGsiCallback(r: GsiCredentialResponse) {
  activeCredentialCallback?.(r);
}

/**
 * Inicializa GSI una sola vez. En llamadas posteriores solo actualiza
 * el callback para que apunte al componente actualmente montado.
 */
export function initializeGsiOnce(
  clientId: string,
  callback: (r: GsiCredentialResponse) => void,
): void {
  activeCredentialCallback = callback; // siempre apunta al componente actual
  if (gsiInitialized) return;

  window.google!.accounts.id.initialize({
    client_id:             clientId,
    callback:              masterGsiCallback,
    ux_mode:               "popup",
    auto_select:           false,
    cancel_on_tap_outside: true,
    context:               "signin",
    use_fedcm_for_prompt:  true,
  });
  gsiInitialized = true;
}

export function loadGsi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  // Ya cargado
  if (window.google?.accounts) return Promise.resolve();

  // Carga en progreso
  if (gsiLoadPromise) return gsiLoadPromise;

  gsiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src   = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload  = () => resolve();
    script.onerror = () => {
      gsiLoadPromise = null; // permite reintentar
      reject(new Error('No se pudo cargar Google Identity Services'));
    };
    document.head.appendChild(script);
  });

  return gsiLoadPromise;
}
