import { useLoadingStore } from "../stores/loading.store";

// ── Error tipado (reemplaza AxiosError) ──────────────────────────────────────
export class ApiError<T = unknown> extends Error {
  readonly status: number;
  readonly data: T | undefined;

  constructor(status: number, data?: T) {
    super(`HTTP ${status}`);
    this.name   = "ApiError";
    this.status = status;
    this.data   = data;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const BASE_URL = (import.meta.env.VITE_API_URL as string) ?? "";
const TIMEOUT  = 10_000;

// Token CSRF en memoria — en cross-domain el JS no puede leer cookies del dominio
// de la API, así que el backend lo devuelve en el body y lo guardamos aquí.
let _csrfToken: string | null = null;

export function setCsrfToken(token: string) {
  _csrfToken = token;
}

function getCsrfToken(): string | undefined {
  // Primero intentar el token en memoria (cross-domain / producción)
  if (_csrfToken) return _csrfToken;
  // Fallback: cookie (solo funciona en same-domain / desarrollo local)
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("csrf_token="))
    ?.slice("csrf_token=".length);
}

// ── Request base ──────────────────────────────────────────────────────────────
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T }> {
  const isGet  = method === "GET";
  const csrf   = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!isGet && csrf) headers["X-CSRF-Token"] = csrf;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body !== undefined ? JSON.stringify(body) : null,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(tid);
  }

  const ct      = res.headers.get("content-type") ?? "";
  const isJson  = ct.includes("application/json");
  const payload = isJson ? (await res.json() as unknown) : await res.text();

  if (!res.ok) throw new ApiError(res.status, payload);
  return { data: payload as T };
}

// ── Cola de refresh automático ────────────────────────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

function processQueue(err: unknown): void {
  const q = [...failedQueue];
  failedQueue = [];
  q.forEach(({ resolve, reject }) => (err ? reject(err) : resolve()));
}

// ── Asegurar CSRF antes de cualquier mutación ─────────────────────────────────
let csrfFetchPromise: Promise<void> | null = null;

async function ensureCsrf(): Promise<void> {
  if (getCsrfToken()) return;
  if (!csrfFetchPromise) {
    csrfFetchPromise = request<{ ok: boolean; csrfToken?: string }>("GET", "/auth/csrf")
      .then(({ data }) => { if (data.csrfToken) setCsrfToken(data.csrfToken); })
      .catch(() => {})
      .finally(() => { csrfFetchPromise = null; });
  }
  return csrfFetchPromise;
}

async function requestWithRefresh<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T }> {
  // Asegurar CSRF antes de cualquier mutación
  if (method !== "GET" && !path.includes("/auth/csrf")) {
    await ensureCsrf();
  }

  try {
    return await request<T>(method, path, body);
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 401 &&
      !path.includes("/auth/refresh") &&
      !path.includes("/auth/login")
    ) {
      if (isRefreshing) {
        return new Promise<{ data: T }>((res, rej) => {
          failedQueue.push({
            resolve: () => request<T>(method, path, body).then(res).catch(rej),
            reject:  rej,
          });
        });
      }

      isRefreshing = true;
      try {
        const { data: rd } = await request<{ ok: boolean; accessExpiresAt?: string; sessionExpiresAt?: string; renewalUsed?: boolean; csrfToken?: string }>("POST", "/auth/refresh");
        if (rd) {
          if (rd.csrfToken) setCsrfToken(rd.csrfToken);
          window.dispatchEvent(new CustomEvent("auth:refreshed", { detail: rd }));
        }
        processQueue(null);
        return await request<T>(method, path, body);
      } catch (refreshErr) {
        processQueue(refreshErr);
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
        throw refreshErr;
      } finally {
        isRefreshing = false;
      }
    }

    throw err;
  }
}

// ── Overlay global de carga ───────────────────────────────────────────────────
const SILENT_PATHS = ["/auth/csrf", "/auth/me", "/auth/refresh"];

function withLoading<T>(method: string, path: string, fn: () => Promise<T>): Promise<T> {
  const silent =
    method === "GET" ||
    SILENT_PATHS.some((p) => path.includes(p));
  if (!silent) useLoadingStore.getState().inc();
  return fn().finally(() => { if (!silent) useLoadingStore.getState().dec(); });
}

// ── Cliente público ───────────────────────────────────────────────────────────
export const api = {
  get:    <T>(path: string)                 => withLoading("GET",    path, () => requestWithRefresh<T>("GET",    path)),
  post:   <T>(path: string, body?: unknown) => withLoading("POST",   path, () => requestWithRefresh<T>("POST",   path, body)),
  patch:  <T>(path: string, body?: unknown) => withLoading("PATCH",  path, () => requestWithRefresh<T>("PATCH",  path, body)),
  delete: <T>(path: string)                 => withLoading("DELETE", path, () => requestWithRefresh<T>("DELETE", path)),
};

// ── CSRF inicial ──────────────────────────────────────────────────────────────
export async function initCsrf(): Promise<void> {
  if (!getCsrfToken()) {
    await request<{ ok: boolean; csrfToken?: string }>("GET", "/auth/csrf")
      .then(({ data }) => { if (data.csrfToken) setCsrfToken(data.csrfToken); })
      .catch(() => {});
  }
}
