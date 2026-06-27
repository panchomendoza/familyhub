import type { MiddlewareHandler } from "hono";

interface RateLimitEntry {
  count:     number;
  resetAt:   number;
}

// En producción reemplazar por Redis (ioredis)
const store = new Map<string, RateLimitEntry>();

interface RateLimiterOptions {
  windowMs?:    number;  // ventana en ms
  max?:         number;  // máx requests por ventana
  keyGenerator?: (c: Parameters<MiddlewareHandler>[0]) => string;
}

export function rateLimiter(options: RateLimiterOptions = {}): MiddlewareHandler {
  const windowMs = options.windowMs ?? Number(process.env["RATE_LIMIT_WINDOW_MS"] ?? 900_000);
  const max      = options.max      ?? Number(process.env["RATE_LIMIT_MAX_REQUESTS"] ?? 100);

  // Limpiar entradas expiradas cada minuto
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key);
    }
  }, 60_000);

  return async (c, next) => {
    // En desarrollo no limitamos — todas las requests de localhost comparten
    // la misma key "unknown" y se agotan rápido con hot reload + StrictMode
    if (process.env["NODE_ENV"] !== "production") {
      await next();
      return;
    }

    const key = options.keyGenerator
      ? options.keyGenerator(c)
      : c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";

    const now   = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      c.header("X-RateLimit-Limit",     String(max));
      c.header("X-RateLimit-Remaining", String(max - 1));
      await next();
      return;
    }

    entry.count++;

    if (entry.count > max) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json({ error: "Too many requests" }, 429);
    }

    c.header("X-RateLimit-Limit",     String(max));
    c.header("X-RateLimit-Remaining", String(max - entry.count));
    await next();
  };
}

// Login: permite varios intentos por errores de contraseña normales
export function loginRateLimiter(): MiddlewareHandler {
  return rateLimiter({ windowMs: 15 * 60_000, max: 20 });
}

// Register: pocas veces seguidas es suficiente
export function registerRateLimiter(): MiddlewareHandler {
  return rateLimiter({ windowMs: 60 * 60_000, max: 5 });
}

// Verify / resend: uso ocasional
export function strictRateLimiter(): MiddlewareHandler {
  return rateLimiter({ windowMs: 15 * 60_000, max: 10 });
}
