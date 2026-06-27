import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const { sign, verify } = jwt;
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email.js";
import { strictRateLimiter, loginRateLimiter, registerRateLimiter } from "../middleware/rateLimiter.js";
import {
  requireAuth,
  requireCsrf,
  getCookieValue,
  clearAuthCookies,
} from "../middleware/auth.js";
import type { JwtPayload } from "@familyhub/types";

export const authRoutes = new Hono();

// ══════════════════════════════════════════
//   GET /auth/csrf — inicializar token CSRF
//   Necesario antes del primer login/registro
//   (el usuario aún no tiene cookie csrf_token)
// ══════════════════════════════════════════
authRoutes.get("/csrf", (c) => {
  const existing = getCookieValue(c, "csrf_token");
  // Devolver el token existente o generar uno nuevo.
  // En cross-domain el frontend no puede leer la cookie, por eso lo incluimos en el body.
  if (existing) {
    return c.json({ ok: true, csrfToken: existing });
  }
  const token    = nanoid(32);
  const maxAge   = 30 * 24 * 3600;
  const isProd   = process.env["NODE_ENV"] === "production";
  const secure   = isProd ? "; Secure" : "";
  const sameSite = isProd ? "None" : "Lax";
  c.header(
    "Set-Cookie",
    `csrf_token=${token}${secure}; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}`
  );
  return c.json({ ok: true, csrfToken: token });
});

const BCRYPT_ROUNDS       = 12;
const VERIFY_CODE_EXPIRY  = 15 * 60 * 1000;  // 15 min
const RESET_TOKEN_EXPIRY  = 60 * 60 * 1000;  // 1 hora
const MAX_LOGIN_ATTEMPTS  = 5;
const LOCKOUT_WINDOW_MS   = 15 * 60 * 1000;  // 15 min

// ── Schemas Zod ──
const registerSchema = z.object({
  name:     z.string().min(2).max(80).trim(),
  email:    z.string().email().toLowerCase(),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
    .regex(/[0-9]/, "Debe contener al menos un número"),
});

const loginSchema = z.object({
  email:    z.string().email().toLowerCase(),
  password: z.string().min(1),
});

const verifySchema = z.object({
  email: z.string().email().toLowerCase(),
  code:  z.string().length(6).regex(/^\d+$/),
});

// ══════════════════════════════════════════
//   POST /auth/register
// ══════════════════════════════════════════
authRoutes.post(
  "/register",
  registerRateLimiter(),
  requireCsrf,
  async (c) => {
    const body   = await c.req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);
    }

    const { name, email, password } = parsed.data;

    // Verificar si ya existe — error explícito para que el frontend sugiera recuperar contraseña
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return c.json({ error: "EMAIL_ALREADY_EXISTS" }, 409);
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await db.user.create({
      data: { name, email, password: hashedPassword },
    });

    // Generar código de 6 dígitos y guardarlo hasheado
    const code       = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash   = await bcrypt.hash(code, 10);
    const expiresAt  = new Date(Date.now() + VERIFY_CODE_EXPIRY);

    await db.emailVerifyToken.create({
      data: { userId: user.id, token: codeHash, expiresAt },
    });

    // Si el email falla no bloqueamos el registro — el usuario puede reenviar desde /verify
    const emailSent = await sendVerificationEmail({ to: email, name, code })
      .then(() => true)
      .catch((err: unknown) => {
        console.error("[register] email error:", err instanceof Error ? err.message : err);
        return false;
      });

    if (!emailSent) {
      // Loguear el código para que el admin pueda verificarlo manualmente si es necesario
      console.warn(`[register] código para ${email}: ${code}`);
    }

    return c.json({ message: "Código de verificación enviado a tu email." }, 201);
  }
);

// ══════════════════════════════════════════
//   POST /auth/verify-email
// ══════════════════════════════════════════
authRoutes.post(
  "/verify-email",
  strictRateLimiter(),
  requireCsrf,
  async (c) => {
    const body   = await c.req.json().catch(() => ({}));
    const parsed = verifySchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Código inválido" }, 400);
    }

    const { email, code } = parsed.data;

    const user = await db.user.findUnique({
      where:  { email },
      select: { id: true, name: true },
    });

    // Respuesta genérica siempre
    if (!user) {
      await bcrypt.hash(code, 10); // timing-safe
      return c.json({ error: "Código incorrecto o expirado" }, 400);
    }

    const token = await db.emailVerifyToken.findFirst({
      where: {
        userId: user.id,
        used:   false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!token || !(await bcrypt.compare(code, token.token))) {
      return c.json({ error: "Código incorrecto o expirado" }, 400);
    }

    await db.$transaction([
      db.emailVerifyToken.update({ where: { id: token.id }, data: { used: true } }),
      db.user.update({ where: { id: user.id }, data: { verified: true } }),
    ]);

    return c.json({ message: "Email verificado. Ya puedes iniciar sesión." }, 200);
  }
);

// ══════════════════════════════════════════
//   POST /auth/resend-verification
// ══════════════════════════════════════════
authRoutes.post(
  "/resend-verification",
  strictRateLimiter(),
  requireCsrf,
  async (c) => {
    const body   = await c.req.json().catch(() => ({}));
    const parsed = z.object({ email: z.string().email().toLowerCase() }).safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Email inválido" }, 400);
    }

    const { email } = parsed.data;

    const user = await db.user.findUnique({
      where:  { email },
      select: { id: true, name: true, verified: true },
    });

    // Respuesta genérica para no revelar si el email existe
    if (!user || user.verified) {
      await new Promise((r) => setTimeout(r, 300)); // timing-safe delay
      return c.json({ message: "Si el email está pendiente de verificación, recibirás un nuevo código." }, 200);
    }

    // Invalidar tokens anteriores
    await db.emailVerifyToken.updateMany({
      where: { userId: user.id, used: false },
      data:  { used: true },
    });

    const code      = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash  = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.emailVerifyToken.create({
      data: { userId: user.id, token: codeHash, expiresAt },
    });

    await sendVerificationEmail({ to: email, name: user.name, code });

    return c.json({ message: "Si el email está pendiente de verificación, recibirás un nuevo código." }, 200);
  }
);

// ══════════════════════════════════════════
//   POST /auth/login
// ══════════════════════════════════════════
authRoutes.post(
  "/login",
  loginRateLimiter(),
  requireCsrf,
  async (c) => {
    const ip   = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const body = await c.req.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Credenciales inválidas" }, 401);
    }

    const { email, password } = parsed.data;

    // Verificar lockout por IP y email
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const attempts = await db.loginAttempt.count({
      where: {
        OR: [{ email }, { ipAddress: ip }],
        successful: false,
        createdAt: { gte: windowStart },
      },
    });

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      return c.json({ error: "Cuenta temporalmente bloqueada. Intenta en 15 minutos." }, 429);
    }

    const user = await db.user.findUnique({
      where:  { email },
      select: { id: true, name: true, email: true, password: true, verified: true },
    });

    // Siempre hashear para evitar timing attacks
    const dummyHash = "$2b$12$dummyhashfordummycomparison123456789012345678";
    const isValid   = user?.password
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    await db.loginAttempt.create({
      data: { email, ipAddress: ip, successful: !!(user && isValid) },
    });

    if (!user || !isValid) {
      return c.json({ error: "Credenciales inválidas" }, 401);
    }

    if (!user.verified) {
      // Generar y enviar código nuevo para que el usuario pueda verificar ahora
      const code      = String(Math.floor(100_000 + Math.random() * 900_000));
      const codeHash  = await bcrypt.hash(code, 10);
      const expiresAt = new Date(Date.now() + VERIFY_CODE_EXPIRY);
      await db.emailVerifyToken.create({
        data: { userId: user.id, token: codeHash, expiresAt },
      });
      await sendVerificationEmail({ to: user.email, name: user.name, code }).catch(() => {});
      return c.json({ error: "EMAIL_NOT_VERIFIED" }, 403);
    }

    const families = await getFamiliesForUser(user.id);
    const { accessExpiresAt, sessionExpiresAt, renewalUsed, csrfToken } = await createSession(c, user, ip);

    return c.json({ user: sanitizeUser(user), families, accessExpiresAt, sessionExpiresAt, renewalUsed, csrfToken });
  }
);

// ══════════════════════════════════════════
//   POST /auth/google
// ══════════════════════════════════════════
authRoutes.post(
  "/google",
  strictRateLimiter(),
  requireCsrf,
  async (c) => {
    const { token } = await c.req.json().catch(() => ({}));
    if (!token || typeof token !== "string") {
      return c.json({ error: "Token de Google requerido" }, 400);
    }

    // Verificar token con Google
    const googleUser = await verifyGoogleToken(token);
    if (!googleUser) {
      return c.json({ error: "Token de Google inválido" }, 401);
    }

    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    let user = await db.user.findUnique({
      where:  { email: googleUser.email },
      select: { id: true, name: true, email: true, verified: true },
    });

    const isNew = !user;

    if (!user) {
      user = await db.user.create({
        data: {
          name:      googleUser.name,
          email:     googleUser.email,
          provider:  "google",
          verified:  true,
          avatarUrl: googleUser.picture,
        },
        select: { id: true, name: true, email: true, verified: true },
      });
    }

    const families = await getFamiliesForUser(user.id);
    const { accessExpiresAt: googleAccessExpiry, sessionExpiresAt: googleSessionExpiry, renewalUsed: googleRenewalUsed, csrfToken: googleCsrfToken } = await createSession(c, user, ip);

    return c.json({ user: sanitizeUser(user), families, isNew, accessExpiresAt: googleAccessExpiry, sessionExpiresAt: googleSessionExpiry, renewalUsed: googleRenewalUsed, csrfToken: googleCsrfToken });
  }
);

// ══════════════════════════════════════════
//   POST /auth/refresh
//   Body opcional: { renew: true } para renovación manual por el usuario
// ══════════════════════════════════════════
authRoutes.post("/refresh", async (c) => {
  const refreshTokenCookie = getCookieValue(c, "refresh_token");
  if (!refreshTokenCookie) return c.json({ error: "No autenticado" }, 401);

  const secret = process.env["JWT_REFRESH_SECRET"];
  if (!secret) return c.json({ error: "Error de configuración" }, 500);

  try {
    const payload = verify(refreshTokenCookie, secret) as JwtPayload;
    const now     = new Date();

    // Buscar sesión válida (refresh token no expirado)
    const sessions = await db.session.findMany({
      where: { userId: payload.sub, expiresAt: { gt: now } },
    });

    let validSession: typeof sessions[0] | null = null;
    for (const s of sessions) {
      if (await bcrypt.compare(refreshTokenCookie, s.refreshToken)) {
        validSession = s;
        break;
      }
    }

    if (!validSession) {
      // Posible robo de token — invalidar todas las sesiones
      await db.session.deleteMany({ where: { userId: payload.sub } });
      return c.json({ error: "Sesión inválida" }, 401);
    }

    // ── Verificar límite absoluto ────────────────────────────────────────
    if (validSession.absoluteExpiresAt <= now) {
      await db.session.delete({ where: { id: validSession.id } });
      return c.json({ error: "Sesión expirada" }, 401);
    }

    // ── Leer body: ¿es renovación manual? ───────────────────────────────
    const body = await c.req.json().catch(() => ({})) as { renew?: boolean };
    const isManualRenewal = body.renew === true;

    // Si intenta renovar manualmente pero ya usó la renovación → rechazar
    if (isManualRenewal && validSession.renewalUsed) {
      return c.json({ error: "Ya usaste tu renovación de sesión" }, 403);
    }

    const user = await db.user.findUnique({
      where:  { id: payload.sub },
      select: { id: true, name: true, email: true, verified: true },
    });
    if (!user) return c.json({ error: "Usuario no encontrado" }, 401);

    // Rotation: eliminar sesión vieja
    await db.session.delete({ where: { id: validSession.id } });

    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    const sessionOpts = isManualRenewal
      ? { inheritedRenewalUsed: true }                                        // renovación manual: nuevo absoluteExpiresAt, marca renewalUsed
      : { inheritedAbsoluteExpiresAt: validSession.absoluteExpiresAt,         // auto-refresh: mantiene límite original
          inheritedRenewalUsed:       validSession.renewalUsed };

    const { accessExpiresAt, sessionExpiresAt, renewalUsed, csrfToken } = await createSession(c, user, ip, sessionOpts);

    return c.json({ ok: true, accessExpiresAt, sessionExpiresAt, renewalUsed, csrfToken });
  } catch {
    return c.json({ error: "Token inválido" }, 401);
  }
});

// ══════════════════════════════════════════
//   GET /auth/me
// ══════════════════════════════════════════
authRoutes.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId") as string;

  const [user, familiesFormatted] = await Promise.all([
    db.user.findUnique({
      where:  { id: userId },
      select: { id: true, name: true, email: true, avatarUrl: true },
    }),
    getFamiliesForUser(userId),
  ]);

  // Buscar la sesión activa para obtener absoluteExpiresAt y renewalUsed
  const accessToken = getCookieValue(c, "access_token");
  let sessionExpiresAt: string | null = null;
  let renewalUsed = false;

  if (accessToken) {
    try {
      const { verify: jwtVerify } = jwt;
      const payload = jwtVerify(accessToken, process.env["JWT_ACCESS_SECRET"]!) as JwtPayload;
      const session = await db.session.findFirst({
        where: { userId: payload.sub, absoluteExpiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      if (session) {
        sessionExpiresAt = session.absoluteExpiresAt.toISOString();
        renewalUsed      = session.renewalUsed;
      }
    } catch { /* token inválido, se devuelve null */ }
  }

  const accessExpiresAt = new Date(Date.now() + parseExpiresIn(process.env["JWT_ACCESS_EXPIRES"] ?? "15m")).toISOString();
  return c.json({ user, families: familiesFormatted, accessExpiresAt, sessionExpiresAt, renewalUsed });
});

// ══════════════════════════════════════════
//   POST /auth/logout
// ══════════════════════════════════════════
authRoutes.post("/logout", async (c) => {
  // No usamos requireAuth — el logout siempre debe limpiar cookies,
  // incluso si el access token ya expiró.
  const accessToken        = getCookieValue(c, "access_token");
  const refreshTokenCookie = getCookieValue(c, "refresh_token");

  // Intentar invalidar la sesión en DB si podemos identificar al usuario
  if (accessToken) {
    try {
      const secret  = process.env["JWT_ACCESS_SECRET"]!;
      const payload = verify(accessToken, secret) as { sub: string };
      if (refreshTokenCookie) {
        const sessions = await db.session.findMany({ where: { userId: payload.sub } });
        for (const session of sessions) {
          if (await bcrypt.compare(refreshTokenCookie, session.refreshToken)) {
            await db.session.delete({ where: { id: session.id } });
            break;
          }
        }
      }
    } catch {
      // Token expirado o inválido — igual limpiamos las cookies
    }
  }

  clearAuthCookies(c);
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   POST /auth/forgot-password
//   Genera un código OTP de 6 dígitos y lo
//   guarda hasheado. En dev lo imprime en consola.
// ══════════════════════════════════════════
authRoutes.post("/forgot-password", async (c) => {
  const body   = await c.req.json().catch(() => ({}));
  const email  = String(body.email ?? "").trim().toLowerCase();

  if (!email) return c.json({ error: "Email requerido" }, 400);

  // Siempre responder 200 para no revelar si el email existe
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.provider !== "email") {
    return c.json({ ok: true });
  }

  // Eliminar códigos previos para este email
  await db.passwordResetCode.deleteMany({ where: { email } });

  // Generar código 6 dígitos
  const code     = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await db.passwordResetCode.create({ data: { email, codeHash, expiresAt } });

  await sendPasswordResetEmail({ to: email, name: user.name, code });

  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   POST /auth/verify-reset-code
//   Valida el OTP. Si es correcto devuelve
//   un resetToken de vida corta (10 min).
// ══════════════════════════════════════════
authRoutes.post("/verify-reset-code", async (c) => {
  const body  = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const code  = String(body.code ?? "").trim();

  if (!email || !code) return c.json({ error: "Datos incompletos" }, 400);

  const record = await db.passwordResetCode.findFirst({ where: { email } });

  if (!record)                           return c.json({ error: "Código inválido o expirado" }, 400);
  if (record.expiresAt < new Date())     return c.json({ error: "El código expiró. Solicita uno nuevo." }, 400);
  if (record.attempts >= 5) {
    await db.passwordResetCode.delete({ where: { id: record.id } });
    return c.json({ error: "Demasiados intentos. Solicita un nuevo código." }, 400);
  }

  const valid = await bcrypt.compare(code, record.codeHash);

  if (!valid) {
    await db.passwordResetCode.update({
      where: { id: record.id },
      data:  { attempts: { increment: 1 } },
    });
    const remaining = 5 - (record.attempts + 1);
    return c.json({ error: `Código incorrecto. Te quedan ${remaining} intento${remaining !== 1 ? "s" : ""}.` }, 400);
  }

  // Código válido — eliminarlo (single-use)
  await db.passwordResetCode.delete({ where: { id: record.id } });

  // Emitir resetToken temporal (10 min)
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return c.json({ error: "Usuario no encontrado" }, 400);

  const resetToken = nanoid(48);
  await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await db.passwordResetToken.create({
    data: {
      userId:    user.id,
      token:     resetToken,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    },
  });

  return c.json({ resetToken });
});

// ══════════════════════════════════════════
//   POST /auth/reset-password
//   Cambia la contraseña usando el resetToken.
//   Invalida todas las sesiones activas.
// ══════════════════════════════════════════
authRoutes.post("/reset-password", async (c) => {
  const body       = await c.req.json().catch(() => ({}));
  const resetToken = String(body.resetToken ?? "").trim();
  const password   = String(body.password  ?? "").trim();

  if (!resetToken || !password) return c.json({ error: "Datos incompletos" }, 400);
  if (password.length < 8)      return c.json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);

  const record = await db.passwordResetToken.findUnique({ where: { token: resetToken } });

  if (!record || record.used)            return c.json({ error: "Token inválido o ya utilizado" }, 400);
  if (record.expiresAt < new Date())     return c.json({ error: "El token expiró. Inicia el proceso nuevamente." }, 400);

  const hash = await bcrypt.hash(password, 12);

  // Actualizar contraseña + marcar token como usado + cerrar todas las sesiones
  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data:  { password: hash },
    }),
    db.passwordResetToken.update({
      where: { id: record.id },
      data:  { used: true },
    }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   HELPERS
// ══════════════════════════════════════════

interface CreateSessionOptions {
  /** Límite absoluto heredado de la sesión anterior (auto-refresh: no extiende) */
  inheritedAbsoluteExpiresAt?: Date;
  /** Estado de renovación heredado (auto-refresh: mantiene el valor) */
  inheritedRenewalUsed?: boolean;
}

async function createSession(
  c: Parameters<typeof authRoutes.post>[1] extends (c: infer C) => unknown ? C : never,
  user: { id: string; name: string; email: string },
  ip: string,
  opts: CreateSessionOptions = {}
) {
  const accessSecret  = process.env["JWT_ACCESS_SECRET"]!;
  const refreshSecret = process.env["JWT_REFRESH_SECRET"]!;
  const isProd        = process.env["NODE_ENV"] === "production";

  // ── Access token ─────────────────────────────────────────────────────
  const accessExpiresIn = process.env["JWT_ACCESS_EXPIRES"] ?? "15m";
  const accessExpiresMs = parseExpiresIn(accessExpiresIn);
  const accessExpiresAt = new Date(Date.now() + accessExpiresMs).toISOString();

  const accessToken = sign(
    { sub: user.id, name: user.name, email: user.email } satisfies Omit<JwtPayload, "iat" | "exp">,
    accessSecret,
    { expiresIn: accessExpiresIn }
  );

  // ── Refresh token (vida corta, igual al access para rotación) ─────────
  const refreshExpiresIn = process.env["JWT_REFRESH_EXPIRES"] ?? "1d";
  const refreshToken = sign(
    { sub: user.id } satisfies Pick<JwtPayload, "sub">,
    refreshSecret,
    { expiresIn: refreshExpiresIn }
  );
  const refreshExpiresMs = parseExpiresIn(refreshExpiresIn);
  const refreshExpiresAt = new Date(Date.now() + refreshExpiresMs);

  // ── Sesión absoluta ──────────────────────────────────────────────────
  // En auto-refresh: hereda absoluteExpiresAt original (no extiende la sesión)
  // En login nuevo o renovación manual: calcula desde ahora
  const sessionMaxMs       = parseExpiresIn(process.env["SESSION_MAX_EXPIRES"] ?? "30m");
  const absoluteExpiresAt  = opts.inheritedAbsoluteExpiresAt ?? new Date(Date.now() + sessionMaxMs);
  const renewalUsed        = opts.inheritedRenewalUsed ?? false;

  // Guardar refresh token hasheado en BD
  const refreshHash = await bcrypt.hash(refreshToken, 10);

  await db.session.create({
    data: {
      userId:             user.id,
      refreshToken:       refreshHash,
      ipAddress:          ip,
      userAgent:          typeof c.req.header === "function" ? c.req.header("user-agent") : undefined,
      expiresAt:          refreshExpiresAt,
      absoluteExpiresAt,
      renewalUsed,
    },
  });

  // ── Cookies ──────────────────────────────────────────────────────────
  const csrfToken = nanoid(32);
  // SameSite=None en producción para frontend y API en dominios distintos (requiere Secure)
  const sameSite  = isProd ? "None" as const : "Lax" as const;
  const baseOpts  = { httpOnly: true, sameSite, path: "/", secure: isProd };

  setCookie(c, "access_token",  accessToken,  { ...baseOpts, maxAge: Math.floor(accessExpiresMs  / 1000) });
  setCookie(c, "refresh_token", refreshToken, { ...baseOpts, maxAge: Math.floor(refreshExpiresMs / 1000) });
  setCookie(c, "csrf_token",    csrfToken,    { sameSite, path: "/", secure: isProd, maxAge: Math.floor(sessionMaxMs / 1000) });

  // Devolver el csrfToken en el body para que el frontend lo guarde en memoria
  // (en cross-domain, JS no puede leer cookies de otro dominio)
  return {
    accessExpiresAt,
    sessionExpiresAt: absoluteExpiresAt.toISOString(),
    renewalUsed,
    csrfToken,
  };
}

/** Convierte "30s" → 30000, "15m" → 900000, "1h" → 3600000, "1d" → 86400000 */
function parseExpiresIn(val: string): number {
  const n = parseInt(val, 10);
  if (val.endsWith("s")) return n * 1_000;
  if (val.endsWith("h")) return n * 3_600 * 1_000;
  if (val.endsWith("d")) return n * 86_400 * 1_000;
  return n * 60 * 1_000; // minutos
}

async function verifyGoogleToken(token: string) {
  try {
    const res  = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    const data = await res.json() as {
      email:          string;
      name:           string;
      picture:        string;
      email_verified: string;
      aud:            string;
    };

    if (
      !res.ok ||
      data.aud !== process.env["GOOGLE_CLIENT_ID"] ||
      data.email_verified !== "true"
    ) {
      return null;
    }

    return { email: data.email, name: data.name, picture: data.picture };
  } catch {
    return null;
  }
}

/** Devuelve familias con miembros aplanados (name, email, avatarUrl incluidos) */
async function getFamiliesForUser(userId: string) {
  const families = await db.family.findMany({
    where: { members: { some: { userId } } },
    include: {
      members: {
        select: {
          id:              true,
          userId:          true,
          role:            true,
          dashboardAccess: true,
          user: { select: { name: true, email: true, avatarUrl: true } },
        },
      },
    },
  });
  return families.map(f => ({
    ...f,
    members: f.members.map(m => ({
      id:              m.id,
      userId:          m.userId,
      role:            m.role,
      dashboardAccess: m.dashboardAccess,
      name:            m.user.name,
      email:           m.user.email,
      avatarUrl:       m.user.avatarUrl,
    })),
  }));
}

function sanitizeUser(user: { id: string; name: string; email: string; [key: string]: unknown }) {
  const { password: _, ...safe } = user as typeof user & { password?: string };
  return safe;
}
