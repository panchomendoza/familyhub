import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireAuth, requireCsrf, requireFamilyMember } from "../middleware/auth.js";
import type { AppEnv } from "../lib/hono.js";

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.use("*", requireAuth);

// ── Schemas ──
const childSchema = z.object({
  name:          z.string().min(1).max(80).trim(),
  birthdate:     z.string().datetime().optional().nullable(),
  gender:        z.enum(["M", "F"]).optional().nullable(),
  birthplace:    z.string().max(120).optional().nullable(),
  birthWeight:   z.number().positive().optional().nullable(),
  birthHeight:   z.number().positive().optional().nullable(),
  birthHeadCirc: z.number().positive().optional().nullable(),
  bloodType:     z.string().max(10).optional().nullable(),
  notes:         z.string().max(500).optional().nullable(),
});

const controlSchema = z.object({
  date:     z.string().datetime(),
  doctor:   z.string().max(120).optional().nullable(),
  center:   z.string().max(120).optional().nullable(),
  weight:   z.number().positive().optional().nullable(),
  height:   z.number().positive().optional().nullable(),
  headCirc: z.number().positive().optional().nullable(),
  notes:    z.string().max(500).optional().nullable(),
});

const vaccineSchema = z.object({
  date:  z.string().datetime(),
  name:  z.string().min(1).max(120).trim(),
  dose:  z.string().max(50).optional().nullable(),
  batch: z.string().max(50).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const visitSchema = z.object({
  date:      z.string().datetime(),
  reason:    z.string().min(1).max(200).trim(),
  doctor:    z.string().max(120).optional().nullable(),
  center:    z.string().max(120).optional().nullable(),
  diagnosis: z.string().max(500).optional().nullable(),
  treatment: z.string().max(500).optional().nullable(),
  notes:     z.string().max(500).optional().nullable(),
});

const examSchema = z.object({
  date:       z.string().datetime(),
  type:       z.string().min(1).max(120).trim(),
  laboratory: z.string().max(120).optional().nullable(),
  result:     z.string().max(1000).optional().nullable(),
  controlId:  z.string().optional().nullable(),
  visitId:    z.string().optional().nullable(),
});

const attachmentSchema = z.object({
  name:       z.string().min(1).max(200).trim(),
  type:       z.enum(["prescription", "result", "indication", "other"]),
  date:       z.string().datetime(),
  fileName:   z.string().min(1).max(255),
  fileSize:   z.number().int().positive(),
  mimeType:   z.string().min(1).max(100),
  storageKey: z.string().min(1),
  notes:      z.string().max(500).optional().nullable(),
  controlId:  z.string().optional().nullable(),
  visitId:    z.string().optional().nullable(),
});

// ══════════════════════════════════════════
//   CHILDREN
// ══════════════════════════════════════════

// GET /health/:familyId/children
healthRoutes.get("/:familyId/children", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const children = await db.child.findMany({
    where:   { familyId },
    orderBy: { birthdate: "asc" },
  });
  return c.json({ children });
});

// POST /health/:familyId/children
healthRoutes.post("/:familyId/children", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const body     = await c.req.json().catch(() => ({}));
  const parsed   = childSchema.safeParse(body);

  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const child = await db.child.create({
    data: {
      familyId,
      ...parsed.data,
      birthdate: parsed.data.birthdate ? new Date(parsed.data.birthdate) : null,
    },
  });
  return c.json({ child }, 201);
});

// GET /health/:familyId/children/:childId
healthRoutes.get("/:familyId/children/:childId", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const child    = await getChildOrFail(c.req.param("childId"), familyId);
  if (!child) return c.json({ error: "Niño/a no encontrado" }, 404);

  const [controls, vaccines, visits, exams, attachments] = await Promise.all([
    db.control.findMany({ where: { childId: child.id }, orderBy: { date: "desc" } }),
    db.vaccine.findMany({ where: { childId: child.id }, orderBy: { date: "desc" } }),
    db.visit.findMany({ where: { childId: child.id }, orderBy: { date: "desc" } }),
    db.exam.findMany({ where: { childId: child.id }, orderBy: { date: "desc" } }),
    db.attachment.findMany({ where: { childId: child.id }, orderBy: { date: "desc" } }),
  ]);

  return c.json({ child, controls, vaccines, visits, exams, attachments });
});

// PATCH /health/:familyId/children/:childId
healthRoutes.patch("/:familyId/children/:childId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  const existing = await getChildOrFail(childId, familyId);
  if (!existing) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = childSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const child = await db.child.update({
    where: { id: childId },
    data:  {
      ...parsed.data,
      ...(parsed.data.birthdate !== undefined && {
        birthdate: parsed.data.birthdate ? new Date(parsed.data.birthdate) : null,
      }),
    },
  });
  return c.json({ child });
});

// DELETE /health/:familyId/children/:childId
healthRoutes.delete("/:familyId/children/:childId", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  const existing = await getChildOrFail(childId, familyId);
  if (!existing) return c.json({ error: "Niño/a no encontrado" }, 404);

  await db.child.delete({ where: { id: childId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   CONTROLS
// ══════════════════════════════════════════

healthRoutes.get("/:familyId/children/:childId/checkups", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const controls = await db.control.findMany({
    where:   { childId },
    orderBy: { date: "desc" },
  });
  return c.json({ controls });
});

healthRoutes.post("/:familyId/children/:childId/checkups", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = controlSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const control = await db.control.create({
    data: { childId, ...parsed.data, date: new Date(parsed.data.date) },
  });
  return c.json({ control }, 201);
});

healthRoutes.patch("/:familyId/children/:childId/checkups/:controlId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const childId   = c.req.param("childId");
  const controlId = c.req.param("controlId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = controlSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const control = await db.control.update({
    where: { id: controlId },
    data:  { ...parsed.data, ...(parsed.data.date && { date: new Date(parsed.data.date) }) },
  });
  return c.json({ control });
});

healthRoutes.delete("/:familyId/children/:childId/checkups/:controlId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const childId   = c.req.param("childId");
  const controlId = c.req.param("controlId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  await db.control.delete({ where: { id: controlId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   VACCINES
// ══════════════════════════════════════════

healthRoutes.get("/:familyId/children/:childId/vaccines", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const vaccines = await db.vaccine.findMany({ where: { childId }, orderBy: { date: "desc" } });
  return c.json({ vaccines });
});

healthRoutes.post("/:familyId/children/:childId/vaccines", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = vaccineSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const vaccine = await db.vaccine.create({
    data: { childId, ...parsed.data, date: new Date(parsed.data.date) },
  });
  return c.json({ vaccine }, 201);
});

healthRoutes.patch("/:familyId/children/:childId/vaccines/:vaccineId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const childId   = c.req.param("childId");
  const vaccineId = c.req.param("vaccineId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = vaccineSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const vaccine = await db.vaccine.update({
    where: { id: vaccineId },
    data:  { ...parsed.data, ...(parsed.data.date && { date: new Date(parsed.data.date) }) },
  });
  return c.json({ vaccine });
});

healthRoutes.delete("/:familyId/children/:childId/vaccines/:vaccineId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const childId   = c.req.param("childId");
  const vaccineId = c.req.param("vaccineId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  await db.vaccine.delete({ where: { id: vaccineId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   VISITS
// ══════════════════════════════════════════

healthRoutes.get("/:familyId/children/:childId/visits", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const visits = await db.visit.findMany({ where: { childId }, orderBy: { date: "desc" } });
  return c.json({ visits });
});

healthRoutes.post("/:familyId/children/:childId/visits", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = visitSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const visit = await db.visit.create({
    data: { childId, ...parsed.data, date: new Date(parsed.data.date) },
  });
  return c.json({ visit }, 201);
});

healthRoutes.patch("/:familyId/children/:childId/visits/:visitId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  const visitId  = c.req.param("visitId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = visitSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const visit = await db.visit.update({
    where: { id: visitId },
    data:  { ...parsed.data, ...(parsed.data.date && { date: new Date(parsed.data.date) }) },
  });
  return c.json({ visit });
});

healthRoutes.delete("/:familyId/children/:childId/visits/:visitId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  const visitId  = c.req.param("visitId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  await db.visit.delete({ where: { id: visitId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   EXAMS
// ══════════════════════════════════════════

healthRoutes.get("/:familyId/children/:childId/exams", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const exams = await db.exam.findMany({ where: { childId }, orderBy: { date: "desc" } });
  return c.json({ exams });
});

healthRoutes.post("/:familyId/children/:childId/exams", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = examSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const exam = await db.exam.create({
    data: { childId, ...parsed.data, date: new Date(parsed.data.date) },
  });
  return c.json({ exam }, 201);
});

healthRoutes.patch("/:familyId/children/:childId/exams/:examId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  const examId   = c.req.param("examId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = examSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const exam = await db.exam.update({
    where: { id: examId },
    data:  { ...parsed.data, ...(parsed.data.date && { date: new Date(parsed.data.date) }) },
  });
  return c.json({ exam });
});

healthRoutes.delete("/:familyId/children/:childId/exams/:examId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  const examId   = c.req.param("examId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  await db.exam.delete({ where: { id: examId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   ATTACHMENTS
// Frontend uploads directly to S3/Supabase Storage via pre-signed URL.
// This endpoint only registers metadata and returns signed read URLs.
// ══════════════════════════════════════════

// GET /health/:familyId/children/:childId/attachments
healthRoutes.get("/:familyId/children/:childId/attachments", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const attachments = await db.attachment.findMany({
    where:   { childId },
    orderBy: { date: "desc" },
  });

  const withUrls = attachments.map((a) => ({
    ...a,
    url: generatePresignedUrl(a.storageKey),
  }));

  return c.json({ attachments: withUrls });
});

// POST /health/:familyId/children/:childId/attachments
healthRoutes.post("/:familyId/children/:childId/attachments", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const childId  = c.req.param("childId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = attachmentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const attachment = await db.attachment.create({
    data: {
      childId,
      ...parsed.data,
      date: new Date(parsed.data.date),
    },
  });

  return c.json({ attachment: { ...attachment, url: generatePresignedUrl(attachment.storageKey) } }, 201);
});

// DELETE /health/:familyId/children/:childId/attachments/:attachmentId
healthRoutes.delete("/:familyId/children/:childId/attachments/:attachmentId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId    = c.get("familyId") as string;
  const childId     = c.req.param("childId");
  const attachmentId = c.req.param("attachmentId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  await db.attachment.delete({ where: { id: attachmentId } });
  return c.json({ ok: true });
});

// GET /health/:familyId/children/:childId/attachments/:attachmentId/url
healthRoutes.get("/:familyId/children/:childId/attachments/:attachmentId/url", requireFamilyMember(), async (c) => {
  const familyId    = c.get("familyId") as string;
  const childId     = c.req.param("childId");
  const attachmentId = c.req.param("attachmentId");
  if (!await getChildOrFail(childId, familyId)) return c.json({ error: "Niño/a no encontrado" }, 404);

  const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.childId !== childId) return c.json({ error: "Archivo no encontrado" }, 404);

  return c.json({ url: generatePresignedUrl(attachment.storageKey), expiresIn: 3600 });
});

// ══════════════════════════════════════════
//   HELPERS
// ══════════════════════════════════════════

async function getChildOrFail(childId: string, familyId: string) {
  return db.child.findFirst({ where: { id: childId, familyId } });
}

/**
 * Generates a pre-signed URL for temporary file access.
 * Replace with real AWS S3 / Supabase Storage implementation.
 */
function generatePresignedUrl(storageKey: string): string {
  // TODO: integrate with @aws-sdk/s3-request-presigner or Supabase Storage
  const baseUrl  = process.env["STORAGE_PUBLIC_URL"] ?? "https://storage.example.com";
  const expires  = Math.floor(Date.now() / 1000) + 3600;
  return `${baseUrl}/${storageKey}?expires=${expires}`;
}
