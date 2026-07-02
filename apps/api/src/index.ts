import "dotenv/config";
import { registerZodEs } from "./lib/zodEs.js";
registerZodEs();
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { logger } from "hono/logger";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { authRoutes }     from "./routes/auth.js";
import { familyRoutes }   from "./routes/families.js";
import { expensesRoutes } from "./routes/expenses.js";
import { healthRoutes }   from "./routes/health.js";
import { stockRoutes }    from "./routes/stock.js";
import { vehiclesRoutes } from "./routes/vehicles.js";
import { medicinesRoutes } from "./routes/medicines.js";

const app = new Hono();

// ══════════════════════════════════════════
//   SEGURIDAD — Middlewares globales
// ══════════════════════════════════════════

// 1. Headers de seguridad HTTP
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "blob:"],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
      upgradeInsecureRequests: [],
    },
    xFrameOptions:            "DENY",
    xContentTypeOptions:      "nosniff",
    referrerPolicy:           "strict-origin-when-cross-origin",
    strictTransportSecurity:  "max-age=31536000; includeSubDomains",
    permissionsPolicy: {
      camera:      [],
      microphone:  [],
      geolocation: [],
    },
  })
);

// 2. CORS — solo orígenes permitidos
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        process.env["FRONTEND_URL"] ?? "http://localhost:5173",
      ];
      if (process.env["NODE_ENV"] === "development") {
        allowed.push(
          "http://localhost:5173", "http://127.0.0.1:5173",
          "http://localhost:3000", "http://127.0.0.1:3000",
        );
      }
      return allowed.includes(origin ?? "") ? origin : null;
    },
    allowMethods:  ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders:  ["Content-Type", "X-CSRF-Token"],
    exposeHeaders: ["X-Request-Id"],
    credentials:   true,  // necesario para cookies HttpOnly
    maxAge:        86400,
  })
);

// 3. Logger (solo en desarrollo)
if (process.env["NODE_ENV"] !== "production") {
  app.use("*", logger());
}

// 4. Rate limiting global
app.use("*", rateLimiter());

// 5. Request ID para trazabilidad
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.header("X-Request-Id", requestId);
  c.set("requestId", requestId);
  await next();
});

// ══════════════════════════════════════════
//   RUTAS
// ══════════════════════════════════════════

app.route("/auth",     authRoutes);
app.route("/families", familyRoutes);
app.route("/expenses", expensesRoutes);
app.route("/health",   healthRoutes);
app.route("/stock",    stockRoutes);
app.route("/vehicles", vehiclesRoutes);
app.route("/medicines", medicinesRoutes);

// Health check (ruta dedicada, no conflicta con healthRoutes del dashboard)
app.get("/_health", (c) =>
  c.json({ status: "ok", ts: new Date().toISOString() })
);

// 404
app.notFound((c) =>
  c.json({ error: "Not found" }, 404)
);

// Error global — no exponer stack traces en producción
app.onError((err, c) => {
  // Siempre loguear el error completo con contexto para diagnóstico
  console.error(`[ERROR] ${c.req.method} ${c.req.path} —`, err?.message ?? err);
  if (err?.stack) console.error(err.stack);
  const isProd = process.env["NODE_ENV"] === "production";
  return c.json(
    {
      error:   "Internal server error",
      message: isProd ? undefined : err.message,
    },
    500
  );
});

// ══════════════════════════════════════════
//   ARRANQUE
// ══════════════════════════════════════════

const port = Number(process.env["PORT"] ?? 4000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`🚀 API corriendo en http://localhost:${port}`);
  console.log(`   Entorno: ${process.env["NODE_ENV"] ?? "development"}`);
});
