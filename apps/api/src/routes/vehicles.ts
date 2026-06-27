import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireAuth, requireCsrf, requireFamilyMember } from "../middleware/auth.js";
import type { AppEnv } from "../lib/hono.js";

export const vehiclesRoutes = new Hono<AppEnv>();

vehiclesRoutes.use("*", requireAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Verifica que el vehículo pertenece a la familia del request */
async function getVehicle(vehicleId: string, familyId: string) {
  return db.vehicle.findFirst({ where: { id: vehicleId, familyId } });
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const vehicleSchema = z.object({
  type:         z.enum(["car", "motorcycle", "truck", "van", "other"]),
  brand:        z.string().min(1).max(80).trim(),
  model:        z.string().min(1).max(80).trim(),
  year:         z.number().int().min(1900).max(new Date().getFullYear() + 1),
  engineCC:     z.number().int().min(50).optional().nullable(),
  fuelType:     z.enum(["gasoline", "diesel", "electric", "hybrid", "gas"]).optional().nullable(),
  transmission: z.enum(["manual", "automatic"]).optional().nullable(),
  licensePlate: z.string().min(1).max(20).trim(),
  vin:          z.string().max(17).trim().optional().nullable(),
  color:        z.string().max(40).trim().optional().nullable(),
  currentKm:    z.number().int().min(0).default(0),
  doors:        z.number().int().min(1).max(10).optional().nullable(),
});

const kmSchema = z.object({
  currentKm: z.number().int().min(0),
});

const sellSchema = z.object({
  soldDate:  z.string().datetime(),           // ISO string
  soldPrice: z.number().min(0).optional(),
});

const maintenanceSchema = z.object({
  type:        z.string().min(1).max(60).trim(),
  description: z.string().min(1).max(500).trim(),
  date:        z.string().datetime(),
  odometer:    z.number().int().min(0),
  cost:        z.number().min(0).optional().nullable(),
  workshop:    z.string().max(120).trim().optional().nullable(),
  nextKm:      z.number().int().min(0).optional().nullable(),
  nextDate:    z.string().datetime().optional().nullable(),
});

const documentSchema = z.object({
  type:           z.string().min(1).max(60).trim(),
  issueDate:      z.string().datetime(),
  expiryDate:     z.string().datetime(),
  amount:         z.number().min(0).optional().nullable(),
  company:        z.string().max(120).trim().optional().nullable(),
  notes:          z.string().max(500).trim().optional().nullable(),
  attachmentName: z.string().max(255).trim().optional().nullable(),
  attachmentData: z.string().optional().nullable(),  // base64 data URL
});

const expenseSchema = z.object({
  date:        z.string().datetime(),
  category:    z.string().min(1).max(60).trim(),
  description: z.string().max(300).trim().default(""),
  amount:      z.number().min(0),
  odometer:    z.number().int().min(0).optional().nullable(),
  liters:      z.number().min(0).optional().nullable(),
});

// ══════════════════════════════════════════════════════════════════════════════
//   VEHICLES
// ══════════════════════════════════════════════════════════════════════════════

// GET /vehicles/:familyId
// Devuelve todos los vehículos de la familia (sin sub-recursos)
vehiclesRoutes.get("/:familyId", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const vehicles = await db.vehicle.findMany({
    where:   { familyId },
    orderBy: { createdAt: "asc" },
  });
  return c.json({ vehicles });
});

// GET /vehicles/:familyId/:vehicleId
// Devuelve el vehículo con todos sus sub-recursos
vehiclesRoutes.get("/:familyId/:vehicleId", requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, familyId },
    include: {
      maintenances: { orderBy: { date: "desc" } },
      documents:    { orderBy: { expiryDate: "asc" } },
      expenses:     { orderBy: { date: "desc" } },
    },
  });

  if (!vehicle) return c.json({ error: "Vehículo no encontrado" }, 404);
  return c.json({ vehicle });
});

// POST /vehicles/:familyId
vehiclesRoutes.post("/:familyId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const body     = await c.req.json().catch(() => ({}));
  const parsed   = vehicleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const vehicle = await db.vehicle.create({
    data: { familyId, ...parsed.data },
  });
  return c.json({ vehicle }, 201);
});

// PATCH /vehicles/:familyId/:vehicleId
vehiclesRoutes.patch("/:familyId/:vehicleId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);
  if (existing.sold) return c.json({ error: "No se puede editar un vehículo vendido" }, 409);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = vehicleSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const vehicle = await db.vehicle.update({ where: { id: vehicleId }, data: parsed.data });
  return c.json({ vehicle });
});

// PATCH /vehicles/:familyId/:vehicleId/km — actualizar odómetro
vehiclesRoutes.patch("/:familyId/:vehicleId/km", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);
  if (existing.sold) return c.json({ error: "No se puede editar un vehículo vendido" }, 409);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = kmSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const vehicle = await db.vehicle.update({
    where: { id: vehicleId },
    data:  { currentKm: parsed.data.currentKm },
  });
  return c.json({ vehicle });
});

// PATCH /vehicles/:familyId/:vehicleId/sell — marcar como vendido
vehiclesRoutes.patch("/:familyId/:vehicleId/sell", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);
  if (existing.sold) return c.json({ error: "El vehículo ya está marcado como vendido" }, 409);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = sellSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const vehicle = await db.vehicle.update({
    where: { id: vehicleId },
    data: {
      sold:      true,
      soldDate:  new Date(parsed.data.soldDate),
      soldPrice: parsed.data.soldPrice ?? null,
    },
  });
  return c.json({ vehicle });
});

// PATCH /vehicles/:familyId/:vehicleId/unsell — deshacer venta
vehiclesRoutes.patch("/:familyId/:vehicleId/unsell", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);

  const vehicle = await db.vehicle.update({
    where: { id: vehicleId },
    data:  { sold: false, soldDate: null, soldPrice: null },
  });
  return c.json({ vehicle });
});

// DELETE /vehicles/:familyId/:vehicleId
vehiclesRoutes.delete("/:familyId/:vehicleId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);

  await db.vehicle.delete({ where: { id: vehicleId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
//   MAINTENANCE
// ══════════════════════════════════════════════════════════════════════════════

// GET /vehicles/:familyId/:vehicleId/maintenance
vehiclesRoutes.get("/:familyId/:vehicleId/maintenance", requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);

  const records = await db.vehicleMaintenance.findMany({
    where:   { vehicleId },
    orderBy: { date: "desc" },
  });
  return c.json({ records });
});

// POST /vehicles/:familyId/:vehicleId/maintenance
vehiclesRoutes.post("/:familyId/:vehicleId/maintenance", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);
  if (existing.sold) return c.json({ error: "No se puede modificar un vehículo vendido" }, 409);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = maintenanceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const { date, nextDate, ...rest } = parsed.data;

  // Auto-actualizar odómetro si el nuevo km es mayor
  const newKm = parsed.data.odometer;
  const updates: { currentKm?: number } = {};
  if (newKm > existing.currentKm) updates.currentKm = newKm;

  const [record] = await db.$transaction([
    db.vehicleMaintenance.create({
      data: {
        vehicleId,
        ...rest,
        date:     new Date(date),
        nextDate: nextDate ? new Date(nextDate) : null,
      },
    }),
    ...(updates.currentKm !== undefined
      ? [db.vehicle.update({ where: { id: vehicleId }, data: updates })]
      : []),
  ]);

  return c.json({ record }, 201);
});

// PATCH /vehicles/:familyId/:vehicleId/maintenance/:recordId
vehiclesRoutes.patch("/:familyId/:vehicleId/maintenance/:recordId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");
  const recordId  = c.req.param("recordId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);
  if (existing.sold) return c.json({ error: "No se puede modificar un vehículo vendido" }, 409);

  const existingRecord = await db.vehicleMaintenance.findFirst({ where: { id: recordId, vehicleId } });
  if (!existingRecord) return c.json({ error: "Registro no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = maintenanceSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const { date, nextDate, ...rest } = parsed.data;
  const record = await db.vehicleMaintenance.update({
    where: { id: recordId },
    data:  {
      ...rest,
      ...(date     ? { date:     new Date(date)     } : {}),
      ...(nextDate ? { nextDate: new Date(nextDate) } : {}),
    },
  });
  return c.json({ record });
});

// DELETE /vehicles/:familyId/:vehicleId/maintenance/:recordId
vehiclesRoutes.delete("/:familyId/:vehicleId/maintenance/:recordId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");
  const recordId  = c.req.param("recordId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);

  const existingRecord = await db.vehicleMaintenance.findFirst({ where: { id: recordId, vehicleId } });
  if (!existingRecord) return c.json({ error: "Registro no encontrado" }, 404);

  await db.vehicleMaintenance.delete({ where: { id: recordId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
//   DOCUMENTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /vehicles/:familyId/:vehicleId/documents
vehiclesRoutes.get("/:familyId/:vehicleId/documents", requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);

  const documents = await db.vehicleDocument.findMany({
    where:   { vehicleId },
    orderBy: { expiryDate: "asc" },
  });
  return c.json({ documents });
});

// POST /vehicles/:familyId/:vehicleId/documents
vehiclesRoutes.post("/:familyId/:vehicleId/documents", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);
  if (existing.sold) return c.json({ error: "No se puede modificar un vehículo vendido" }, 409);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = documentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const { issueDate, expiryDate, ...rest } = parsed.data;
  const document = await db.vehicleDocument.create({
    data: {
      vehicleId,
      ...rest,
      issueDate:  new Date(issueDate),
      expiryDate: new Date(expiryDate),
    },
  });
  return c.json({ document }, 201);
});

// PATCH /vehicles/:familyId/:vehicleId/documents/:docId
vehiclesRoutes.patch("/:familyId/:vehicleId/documents/:docId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");
  const docId     = c.req.param("docId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);
  if (existing.sold) return c.json({ error: "No se puede modificar un vehículo vendido" }, 409);

  const existingDoc = await db.vehicleDocument.findFirst({ where: { id: docId, vehicleId } });
  if (!existingDoc) return c.json({ error: "Documento no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = documentSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const { issueDate, expiryDate, ...rest } = parsed.data;
  const document = await db.vehicleDocument.update({
    where: { id: docId },
    data:  {
      ...rest,
      ...(issueDate  ? { issueDate:  new Date(issueDate)  } : {}),
      ...(expiryDate ? { expiryDate: new Date(expiryDate) } : {}),
    },
  });
  return c.json({ document });
});

// DELETE /vehicles/:familyId/:vehicleId/documents/:docId
vehiclesRoutes.delete("/:familyId/:vehicleId/documents/:docId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");
  const docId     = c.req.param("docId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);

  const existingDoc = await db.vehicleDocument.findFirst({ where: { id: docId, vehicleId } });
  if (!existingDoc) return c.json({ error: "Documento no encontrado" }, 404);

  await db.vehicleDocument.delete({ where: { id: docId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
//   EXPENSES
// ══════════════════════════════════════════════════════════════════════════════

// GET /vehicles/:familyId/:vehicleId/expenses?year=2025
vehiclesRoutes.get("/:familyId/:vehicleId/expenses", requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");
  const year      = c.req.query("year");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);

  const yearFilter = year && /^\d{4}$/.test(year)
    ? { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) }
    : undefined;

  const expenses = await db.vehicleExpense.findMany({
    where:   { vehicleId, ...(yearFilter ? { date: yearFilter } : {}) },
    orderBy: { date: "desc" },
  });
  return c.json({ expenses });
});

// POST /vehicles/:familyId/:vehicleId/expenses
vehiclesRoutes.post("/:familyId/:vehicleId/expenses", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);
  if (existing.sold) return c.json({ error: "No se puede modificar un vehículo vendido" }, 409);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const { date, ...rest } = parsed.data;
  const expense = await db.vehicleExpense.create({
    data: { vehicleId, ...rest, date: new Date(date) },
  });
  return c.json({ expense }, 201);
});

// PATCH /vehicles/:familyId/:vehicleId/expenses/:expenseId
vehiclesRoutes.patch("/:familyId/:vehicleId/expenses/:expenseId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");
  const expenseId = c.req.param("expenseId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);
  if (existing.sold) return c.json({ error: "No se puede modificar un vehículo vendido" }, 409);

  const existingExp = await db.vehicleExpense.findFirst({ where: { id: expenseId, vehicleId } });
  if (!existingExp) return c.json({ error: "Gasto no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = expenseSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const { date, ...rest } = parsed.data;
  const expense = await db.vehicleExpense.update({
    where: { id: expenseId },
    data:  { ...rest, ...(date ? { date: new Date(date) } : {}) },
  });
  return c.json({ expense });
});

// DELETE /vehicles/:familyId/:vehicleId/expenses/:expenseId
vehiclesRoutes.delete("/:familyId/:vehicleId/expenses/:expenseId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const vehicleId = c.req.param("vehicleId");
  const expenseId = c.req.param("expenseId");

  const existing = await getVehicle(vehicleId, familyId);
  if (!existing) return c.json({ error: "Vehículo no encontrado" }, 404);

  const existingExp = await db.vehicleExpense.findFirst({ where: { id: expenseId, vehicleId } });
  if (!existingExp) return c.json({ error: "Gasto no encontrado" }, 404);

  await db.vehicleExpense.delete({ where: { id: expenseId } });
  return c.json({ ok: true });
});
