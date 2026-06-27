/**
 * Typed Hono context variables shared across all routes.
 *
 * Hono v4 requires explicit declaration of context variables so that
 * `c.get()` / `c.set()` are type-safe instead of returning `never`.
 *
 * Usage:
 *   import { Hono } from "hono";
 *   import type { AppEnv } from "../lib/hono.js";
 *   export const myRoutes = new Hono<AppEnv>();
 */

import type { FamilyMember } from "@familyhub/types";

export interface AppVariables {
  /** ID del usuario autenticado (set by requireAuth) */
  userId: string;
  /** Objeto user completo (set by requireAuth) */
  user: {
    id:       string;
    name:     string;
    email:    string;
    verified: boolean;
  };
  /** Membresía activa (set by requireFamilyMember) */
  member: {
    id:              string;
    userId:          string;
    familyId:        string;
    role:            "admin" | "member";
    dashboardAccess: string[];
  };
  /** familyId resuelto (set by requireFamilyMember) */
  familyId: string;
  /** UUID de trazabilidad por request (set in index.ts) */
  requestId: string;
}

export type AppEnv = { Variables: AppVariables };
