import type { MiddlewareHandler, Context } from "hono";
import { deleteCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
const { verify } = jwt;
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "../lib/db.js";
import type { JwtPayload } from "@familyhub/types";

// ── Verificar access token (cookie HttpOnly) ──
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookieValue(c, "access_token");

  if (!token) {
    return c.json({ error: "No autenticado" }, 401);
  }

  try {
    const secret = process.env["JWT_ACCESS_SECRET"];
    if (!secret) throw new Error("JWT_ACCESS_SECRET no configurado");

    const payload = verify(token, secret) as JwtPayload;

    // Verificar que el usuario aún existe (no fue eliminado)
    const user = await db.user.findUnique({
      where:  { id: payload.sub },
      select: { id: true, name: true, email: true, verified: true },
    });

    if (!user) {
      clearAuthCookies(c);
      return c.json({ error: "Usuario no encontrado" }, 401);
    }

    if (!user.verified) {
      return c.json({ error: "Email no verificado" }, 403);
    }

    c.set("userId", user.id);
    c.set("user",   user);
    await next();
  } catch {
    clearAuthCookies(c);
    return c.json({ error: "Token inválido o expirado" }, 401);
  }
};

// ── Verificar CSRF token en mutaciones ──
export const requireCsrf: MiddlewareHandler = async (c, next) => {
  // GET y HEAD no necesitan CSRF
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    await next();
    return;
  }

  const secret = process.env["CSRF_SECRET"];
  if (!secret) {
    console.error("CSRF_SECRET no configurado");
    return c.json({ error: "Error de configuración" }, 500);
  }

  const csrfHeader = c.req.header("X-CSRF-Token");
  const csrfCookie = getCookieValue(c, "csrf_token");

  if (!csrfHeader || !csrfCookie) {
    return c.json({ error: "CSRF token faltante" }, 403);
  }

  // Comparación timing-safe para evitar timing attacks
  const expected = Buffer.from(csrfCookie);
  const received = Buffer.from(csrfHeader);

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return c.json({ error: "CSRF token inválido" }, 403);
  }

  await next();
};

// ── Verificar pertenencia a familia ──
export function requireFamilyMember(role?: "admin"): MiddlewareHandler {
  return async (c, next) => {
    const userId   = c.get("userId") as string;
    const familyId = c.req.param("familyId") ?? c.req.header("X-Family-Id");

    if (!familyId) {
      return c.json({ error: "familyId requerido" }, 400);
    }

    const member = await db.familyMember.findUnique({
      where: { userId_familyId: { userId, familyId } },
    });

    if (!member) {
      return c.json({ error: "No perteneces a este hogar" }, 403);
    }

    if (role === "admin" && member.role !== "admin") {
      return c.json({ error: "Se requieren permisos de administrador" }, 403);
    }

    c.set("member",   member);
    c.set("familyId", familyId);
    await next();
  };
}

// ── Helpers ──
function getCookieValue(c: Context, name: string): string | undefined {
  const header = c.req.header("Cookie") ?? "";
  const cookies = header.split(";").map((c) => c.trim());
  const cookie  = cookies.find((c) => c.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

function clearAuthCookies(c: Context) {
  const isProd   = process.env["NODE_ENV"] === "production";
  const sameSite = isProd ? "None" as const : "Lax" as const;
  const baseOpts = { httpOnly: true, sameSite, path: "/", secure: isProd };
  deleteCookie(c, "access_token",  baseOpts);
  deleteCookie(c, "refresh_token", baseOpts);
  // csrf_token no es httpOnly, mismos atributos salvo httpOnly
  deleteCookie(c, "csrf_token", { sameSite, path: "/", secure: isProd });
}

export { getCookieValue, clearAuthCookies };
