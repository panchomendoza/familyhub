import { ApiError } from "./api";

/* ── Tipos ─────────────────────────────────────────────────────────── */
export interface ValidationErrors {
  message:     string;
  fieldErrors: Record<string, string[]>;
  formErrors:  string[];
}

/* ── Parser ─────────────────────────────────────────────────────────── */
export function parseApiError(err: unknown): ValidationErrors {
  if (err instanceof ApiError) {
    const data = err.data as {
      error?:   string;
      details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    } | undefined;
    return {
      message:     data?.error ?? `Error ${err.status}`,
      fieldErrors: data?.details?.fieldErrors ?? {},
      formErrors:  data?.details?.formErrors  ?? [],
    };
  }
  if (err instanceof Error) return { message: err.message, fieldErrors: {}, formErrors: [] };
  return { message: "Error inesperado", fieldErrors: {}, formErrors: [] };
}

/* ── Helper: primer error de un campo ──────────────────────────────── */
export function fieldError(
  errors: ValidationErrors | null | undefined,
  field:  string,
): string | undefined {
  return errors?.fieldErrors[field]?.[0];
}
