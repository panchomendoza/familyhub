import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireAuth, requireCsrf, requireFamilyMember } from "../middleware/auth.js";
import type { AppEnv } from "../lib/hono.js";

export const medicinesRoutes = new Hono<AppEnv>();

medicinesRoutes.use("*", requireAuth);

// ── Constantes (espejo de las del frontend) ──
const CATEGORY_IDS = ["analgesicos", "antibioticos", "vitaminas", "topicos", "digestivos", "otros"] as const;
const UNITS        = ["comprimidos", "cápsulas", "ml", "sobres", "gotas", "parches", "unidades"] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM = /^\d{2}:\d{2}$/;

// ── Schemas ──
const medicineSchema = z.object({
  name:                 z.string().min(1).max(200).trim(),
  categoryId:           z.enum(CATEGORY_IDS),
  dosage:               z.string().max(100).trim().default(""),
  quantity:             z.number().int().min(0).default(0),
  minimum:              z.number().int().min(0).default(0),
  unit:                 z.enum(UNITS).default("comprimidos"),
  expiryDate:           z.string().regex(DATE_ONLY, "Fecha inválida (YYYY-MM-DD)"),
  location:             z.string().max(100).trim().default("Botiquín"),
  forMember:            z.string().max(100).trim().default("Familia"),
  frequencyHours:       z.number().int().min(0).max(720).optional().nullable(),
  indications:          z.string().max(500).optional().nullable(),
  requiresPrescription: z.boolean().default(false),
  disposed:             z.boolean().default(false),
  notes:                z.string().max(500).optional().nullable(),
});

const adjustSchema = z.object({
  delta: z.number().int(), // puede ser negativo
});

const planEntrySchema = z.object({
  medicineId:     z.string().min(1),
  frequencyHours: z.number().int().min(0).max(720).default(8),
  reminderTimes:  z.array(z.string().regex(TIME_HHMM)).max(24).default([]),
  unitsPerDose:   z.number().int().min(1).max(100).default(1),
  notes:          z.string().max(500).optional().nullable(),
});

const planSchema = z.object({
  name:         z.string().min(1).max(200).trim(),
  forMember:    z.string().max(100).trim().default("Familia"),
  prescribedBy: z.string().max(100).optional().nullable(),
  startDate:    z.string().regex(DATE_ONLY, "Fecha inválida (YYYY-MM-DD)"),
  days:         z.number().int().min(1).max(365).nullable(), // null = crónico
  notes:        z.string().max(500).optional().nullable(),
  archived:     z.boolean().default(false),
  entries:      z.array(planEntrySchema).min(1, "Agrega al menos un medicamento al plan"),
});

// ══════════════════════════════════════════
//   MEDICINES
// ══════════════════════════════════════════

// GET /medicines/:familyId/items
medicinesRoutes.get("/:familyId/items", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const items = await db.medicine.findMany({
    where:   { familyId },
    orderBy: { name: "asc" },
  });
  return c.json({ items });
});

// POST /medicines/:familyId/items
medicinesRoutes.post("/:familyId/items", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const body     = await c.req.json().catch(() => ({}));
  const parsed   = medicineSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const item = await db.medicine.create({
    data: { familyId, ...parsed.data },
  });
  return c.json({ item }, 201);
});

// PATCH /medicines/:familyId/items/:itemId
medicinesRoutes.patch("/:familyId/items/:itemId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const itemId   = c.req.param("itemId");

  const existing = await db.medicine.findFirst({ where: { id: itemId, familyId } });
  if (!existing) return c.json({ error: "Medicina no encontrada" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = medicineSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const item = await db.medicine.update({ where: { id: itemId }, data: parsed.data });
  return c.json({ item });
});

// PATCH /medicines/:familyId/items/:itemId/cantidad — ajustar stock (delta +/-)
medicinesRoutes.patch("/:familyId/items/:itemId/cantidad", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const itemId   = c.req.param("itemId");

  const existing = await db.medicine.findFirst({ where: { id: itemId, familyId } });
  if (!existing) return c.json({ error: "Medicina no encontrada" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const item = await db.medicine.update({
    where: { id: itemId },
    data:  { quantity: Math.max(0, existing.quantity + parsed.data.delta) },
  });
  return c.json({ item });
});

// DELETE /medicines/:familyId/items/:itemId — eliminación definitiva
medicinesRoutes.delete("/:familyId/items/:itemId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const itemId   = c.req.param("itemId");

  const existing = await db.medicine.findFirst({ where: { id: itemId, familyId } });
  if (!existing) return c.json({ error: "Medicina no encontrada" }, 404);

  await db.medicine.delete({ where: { id: itemId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   TREATMENT PLANS
// ══════════════════════════════════════════

const planInclude = {
  entries: { orderBy: { id: "asc" as const } },
};

// GET /medicines/:familyId/plans
medicinesRoutes.get("/:familyId/plans", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const plans = await db.treatmentPlan.findMany({
    where:   { familyId },
    include: planInclude,
    orderBy: { startDate: "desc" },
  });
  return c.json({ plans });
});

/** Verifica que todos los medicineId pertenezcan a la familia */
async function validateEntryMedicines(familyId: string, entries: { medicineId: string }[]) {
  const ids   = [...new Set(entries.map(e => e.medicineId))];
  const count = await db.medicine.count({ where: { familyId, id: { in: ids } } });
  return count === ids.length;
}

/** Unidades a descontar del stock por un entry en un plan finito (misma fórmula que el frontend) */
function calcDeduction(days: number, entry: { frequencyHours: number; unitsPerDose: number }): number {
  const h = entry.frequencyHours;
  if (!h || h === 0) return 0;
  const dosesPerDay = h < 24 ? Math.floor(24 / h) : 1 / (h / 24);
  return Math.ceil(days * dosesPerDay) * Math.max(1, entry.unitsPerDose);
}

// POST /medicines/:familyId/plans
medicinesRoutes.post("/:familyId/plans", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const body     = await c.req.json().catch(() => ({}));
  const parsed   = planSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const { entries, ...planData } = parsed.data;

  if (!(await validateEntryMedicines(familyId, entries))) {
    return c.json({ error: "Alguno de los medicamentos no existe en esta familia" }, 404);
  }

  // Plan finito: descontar del stock las dosis calculadas, en la misma transacción
  const plan = await db.$transaction(async (tx) => {
    if (planData.days !== null) {
      for (const entry of entries) {
        const deduction = calcDeduction(planData.days, entry);
        if (deduction === 0) continue;
        const med = await tx.medicine.findUnique({ where: { id: entry.medicineId } });
        if (!med) continue;
        await tx.medicine.update({
          where: { id: entry.medicineId },
          data:  { quantity: Math.max(0, med.quantity - deduction) },
        });
      }
    }
    return tx.treatmentPlan.create({
      data: {
        familyId,
        ...planData,
        entries: { create: entries },
      },
      include: planInclude,
    });
  });
  return c.json({ plan }, 201);
});

// PATCH /medicines/:familyId/plans/:planId
medicinesRoutes.patch("/:familyId/plans/:planId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const planId   = c.req.param("planId");

  const existing = await db.treatmentPlan.findFirst({ where: { id: planId, familyId } });
  if (!existing) return c.json({ error: "Plan no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = planSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const { entries, ...planData } = parsed.data;

  if (entries && !(await validateEntryMedicines(familyId, entries))) {
    return c.json({ error: "Alguno de los medicamentos no existe en esta familia" }, 404);
  }

  // Si vienen entries se reemplazan todas (mismo criterio que el modal del frontend)
  const plan = await db.treatmentPlan.update({
    where: { id: planId },
    data: {
      ...planData,
      ...(entries && {
        entries: {
          deleteMany: {},
          create:     entries,
        },
      }),
    },
    include: planInclude,
  });
  return c.json({ plan });
});

// DELETE /medicines/:familyId/plans/:planId
medicinesRoutes.delete("/:familyId/plans/:planId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const planId   = c.req.param("planId");

  const existing = await db.treatmentPlan.findFirst({ where: { id: planId, familyId } });
  if (!existing) return c.json({ error: "Plan no encontrado" }, 404);

  await db.treatmentPlan.delete({ where: { id: planId } });
  return c.json({ ok: true });
});
