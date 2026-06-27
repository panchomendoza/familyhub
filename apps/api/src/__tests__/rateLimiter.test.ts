/**
 * TEST DE MIDDLEWARE — rateLimiter
 *
 * Patrón: middleware Hono → creamos una mini-app de prueba con el
 * middleware aplicado y le hacemos requests directos sin levantar
 * ningún servidor. Hono provee `app.request()` para esto.
 *
 * Nota: el store del rate limiter es module-level (un Map compartido).
 * Para evitar que los tests se mezclen entre sí usamos IPs distintas
 * en cada describe block.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { rateLimiter } from "../middleware/rateLimiter.js";

// Helper: simula un request GET con una IP de origen dada
function makeRequest(app: Hono, ip: string) {
  return app.request("/ping", {
    method:  "GET",
    headers: { "x-forwarded-for": ip },
  });
}

// Guardamos y restauramos NODE_ENV en cada test para no contaminar otros
let savedEnv: string | undefined;
beforeEach(() => { savedEnv = process.env["NODE_ENV"]; });
afterEach(()  => { process.env["NODE_ENV"] = savedEnv; });

// ─────────────────────────────────────────────────────────────────────────────

describe("rateLimiter — comportamiento básico", () => {
  // IP exclusiva para este grupo → sin interferencias con otros tests
  const IP = "10.0.0.1";

  it("deja pasar requests dentro del límite", async () => {
    process.env["NODE_ENV"] = "production";

    const app = new Hono();
    app.use("*", rateLimiter({ windowMs: 60_000, max: 3 }));
    app.get("/ping", (c) => c.json({ pong: true }));

    const r1 = await makeRequest(app, IP);
    const r2 = await makeRequest(app, IP);
    const r3 = await makeRequest(app, IP);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
  });

  it("bloquea con 429 al superar el límite", async () => {
    process.env["NODE_ENV"] = "production";

    const app = new Hono();
    app.use("*", rateLimiter({ windowMs: 60_000, max: 3 }));
    app.get("/ping", (c) => c.json({ pong: true }));

    // Los 3 primeros pasan (suma al contador anterior del test de arriba
    // si la ventana no expiró, pero alcanza para probar el bloqueo)
    await makeRequest(app, IP);
    await makeRequest(app, IP);
    await makeRequest(app, IP);
    const blocked = await makeRequest(app, IP);

    // El 4to request supera max=3, debe ser bloqueado
    expect(blocked.status).toBe(429);
    const body = await blocked.json() as { error: string };
    expect(body.error).toBe("Too many requests");
  });

  it("incluye el header Retry-After cuando bloquea", async () => {
    process.env["NODE_ENV"] = "production";

    const app = new Hono();
    app.use("*", rateLimiter({ windowMs: 60_000, max: 3 }));
    app.get("/ping", (c) => c.json({ pong: true }));

    // Agotamos el límite (ya viene contado de los tests anteriores en este grupo)
    for (let i = 0; i < 5; i++) await makeRequest(app, IP);
    const blocked = await makeRequest(app, IP);

    expect(blocked.headers.get("Retry-After")).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("rateLimiter — IPs aisladas", () => {
  it("cada IP tiene su propio contador", async () => {
    process.env["NODE_ENV"] = "production";

    const app = new Hono();
    app.use("*", rateLimiter({ windowMs: 60_000, max: 2 }));
    app.get("/ping", (c) => c.json({ pong: true }));

    // IP A supera su límite
    await makeRequest(app, "10.1.0.1");
    await makeRequest(app, "10.1.0.1");
    const blockedA = await makeRequest(app, "10.1.0.1");
    expect(blockedA.status).toBe(429);

    // IP B empieza desde cero — no está afectada por IP A
    const okB = await makeRequest(app, "10.1.0.2");
    expect(okB.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("rateLimiter — desactivado fuera de producción", () => {
  it("no limita en desarrollo aunque se supere el max", async () => {
    process.env["NODE_ENV"] = "development";   // ← no es "production"

    const app = new Hono();
    app.use("*", rateLimiter({ windowMs: 60_000, max: 1 }));  // límite muy bajo
    app.get("/ping", (c) => c.json({ pong: true }));

    // Con max=1 en producción bloquearía al 2do request.
    // En desarrollo todos deben pasar.
    const r1 = await makeRequest(app, "10.2.0.1");
    const r2 = await makeRequest(app, "10.2.0.1");
    const r3 = await makeRequest(app, "10.2.0.1");

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
  });
});
