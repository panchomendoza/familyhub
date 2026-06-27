import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireAuth, requireCsrf, requireFamilyMember } from "../middleware/auth.js";
import type { AppEnv } from "../lib/hono.js";

export const stockRoutes = new Hono<AppEnv>();

stockRoutes.use("*", requireAuth);

// ── Default categories ──
const DEFAULT_STOCK_CATS = [
  { label: "Alimentos",        icon: "🥦", color: "#34C78A", order: 0 },
  { label: "Aseo",             icon: "🧹", color: "#4F7BF7", order: 1 },
  { label: "Higiene Personal", icon: "🧴", color: "#F7874F", order: 2 },
  { label: "Limpieza",         icon: "🧼", color: "#A44FF7", order: 3 },
  { label: "Otros",            icon: "📦", color: "#8A93A8", order: 4 },
] as const;

// ── Schemas ──
const categorySchema = z.object({
  label: z.string().min(1).max(60).trim(),
  icon:  z.string().min(1).max(10),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order: z.number().int().min(0).optional(),
});

const itemSchema = z.object({
  categoryId: z.string().min(1),
  name:       z.string().min(1).max(200).trim(),
  quantity:   z.number().min(0).default(0),
  minimum:    z.number().min(0).default(0),
  unit:       z.string().max(30).default("unidades"),
  location:   z.string().max(100).optional().nullable(),
  barcode:    z.string().max(50).optional().nullable(),
  notes:      z.string().max(500).optional().nullable(),
});

const adjustSchema = z.object({
  delta: z.number(), // can be negative
});

// ══════════════════════════════════════════
//   CATEGORIES
// ══════════════════════════════════════════

// GET /stock/:familyId/categories
stockRoutes.get("/:familyId/categories", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const categories = await db.stockCategory.findMany({
    where:   { familyId },
    include: { items: { orderBy: { name: "asc" } } },
    orderBy: { order: "asc" },
  });
  return c.json({ categories });
});

// POST /stock/:familyId/categories/seed
stockRoutes.post("/:familyId/categories/seed", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const existing = await db.stockCategory.count({ where: { familyId } });
  if (existing > 0) {
    return c.json({ ok: false, message: "Ya existen categorías para esta familia" }, 409);
  }
  const categories = await db.$transaction(
    DEFAULT_STOCK_CATS.map(cat =>
      db.stockCategory.create({ data: { familyId, ...cat } })
    )
  );
  return c.json({ categories }, 201);
});

const MAX_STOCK_CATEGORIES = 10;

// POST /stock/:familyId/categories
stockRoutes.post("/:familyId/categories", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const body     = await c.req.json().catch(() => ({}));
  const parsed   = categorySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const count = await db.stockCategory.count({ where: { familyId } });
  if (count >= MAX_STOCK_CATEGORIES) {
    return c.json({ error: `Límite de ${MAX_STOCK_CATEGORIES} categorías alcanzado.` }, 409);
  }

  const maxOrder = await db.stockCategory.aggregate({ where: { familyId }, _max: { order: true } });
  const category = await db.stockCategory.create({
    data: {
      familyId,
      ...parsed.data,
      order: parsed.data.order ?? (maxOrder._max.order ?? 0) + 1,
    },
  });
  return c.json({ category }, 201);
});

// PATCH /stock/:familyId/categories/:catId
stockRoutes.patch("/:familyId/categories/:catId", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const catId    = c.req.param("catId");

  const existing = await db.stockCategory.findFirst({ where: { id: catId, familyId } });
  if (!existing) return c.json({ error: "Categoría no encontrada" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = categorySchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const category = await db.stockCategory.update({ where: { id: catId }, data: parsed.data });
  return c.json({ category });
});

// DELETE /stock/:familyId/categories/:catId
stockRoutes.delete("/:familyId/categories/:catId", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const catId    = c.req.param("catId");

  const existing = await db.stockCategory.findFirst({
    where:   { id: catId, familyId },
    include: { items: { select: { id: true } } },
  });
  if (!existing) return c.json({ error: "Categoría no encontrada" }, 404);
  if (existing.items.length > 0) {
    return c.json({ error: "La categoría tiene ítems. Muévelos o elimínalos primero." }, 409);
  }

  await db.stockCategory.delete({ where: { id: catId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   ITEMS
// ══════════════════════════════════════════

// GET /stock/:familyId/items
stockRoutes.get("/:familyId/items", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const items = await db.stockItem.findMany({
    where:   { familyId },
    orderBy: { name: "asc" },
  });
  return c.json({ items });
});

// GET /stock/:familyId/items/bajo-minimo
stockRoutes.get("/:familyId/items/bajo-minimo", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;

  const items = await db.stockItem.findMany({
    where:   { familyId },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const belowMinimum = items.filter((i) => i.quantity < i.minimum);
  return c.json({ items: belowMinimum });
});

// GET /stock/:familyId/items/search?q=...&barcode=...
stockRoutes.get("/:familyId/items/search", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const q        = c.req.query("q")?.trim();
  const barcode  = c.req.query("barcode")?.trim();

  if (!q && !barcode) {
    return c.json({ error: "Proporciona q o barcode como parámetro de búsqueda" }, 400);
  }

  const items = await db.stockItem.findMany({
    where: {
      familyId,
      ...(barcode
        ? { barcode }
        : { name: { contains: q, mode: "insensitive" } }),
    },
    include: { category: true },
    orderBy: { name: "asc" },
    take:    20,
  });

  return c.json({ items });
});

// GET /stock/:familyId/items/:itemId
stockRoutes.get("/:familyId/items/:itemId", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const item     = await db.stockItem.findFirst({
    where:   { id: c.req.param("itemId"), familyId },
    include: { category: true },
  });
  if (!item) return c.json({ error: "Ítem no encontrado" }, 404);
  return c.json({ item });
});

// POST /stock/:familyId/items
stockRoutes.post("/:familyId/items", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const body     = await c.req.json().catch(() => ({}));
  const parsed   = itemSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const cat = await db.stockCategory.findFirst({
    where: { id: parsed.data.categoryId, familyId },
  });
  if (!cat) return c.json({ error: "Categoría no encontrada" }, 404);

  const item = await db.stockItem.create({
    data: { familyId, ...parsed.data },
  });
  return c.json({ item }, 201);
});

// PATCH /stock/:familyId/items/:itemId
stockRoutes.patch("/:familyId/items/:itemId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const itemId   = c.req.param("itemId");

  const existing = await db.stockItem.findFirst({ where: { id: itemId, familyId } });
  if (!existing) return c.json({ error: "Ítem no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = itemSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  if (parsed.data.categoryId) {
    const cat = await db.stockCategory.findFirst({ where: { id: parsed.data.categoryId, familyId } });
    if (!cat) return c.json({ error: "Categoría no encontrada" }, 404);
  }

  const item = await db.stockItem.update({ where: { id: itemId }, data: parsed.data });
  return c.json({ item });
});

// PATCH /stock/:familyId/items/:itemId/cantidad — adjust quantity (delta +/-)
stockRoutes.patch("/:familyId/items/:itemId/cantidad", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const itemId   = c.req.param("itemId");

  const existing = await db.stockItem.findFirst({ where: { id: itemId, familyId } });
  if (!existing) return c.json({ error: "Ítem no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const newQuantity = Math.max(0, existing.quantity + parsed.data.delta);
  const item = await db.stockItem.update({
    where: { id: itemId },
    data:  { quantity: newQuantity },
  });
  return c.json({ item });
});

// DELETE /stock/:familyId/items/:itemId
stockRoutes.delete("/:familyId/items/:itemId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const itemId   = c.req.param("itemId");

  const existing = await db.stockItem.findFirst({ where: { id: itemId, familyId } });
  if (!existing) return c.json({ error: "Ítem no encontrado" }, 404);

  await db.stockItem.delete({ where: { id: itemId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   SHOPPING LIST (generated dynamically)
// ══════════════════════════════════════════

/**
 * GET /stock/:familyId/lista-compras
 * Returns below-minimum items grouped by category,
 * ready to format as a WhatsApp message on the frontend.
 */
stockRoutes.get("/:familyId/lista-compras", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;

  const categories = await db.stockCategory.findMany({
    where:   { familyId },
    include: {
      items: {
        where:   { familyId },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  const shoppingList = categories
    .map((cat) => ({
      id:    cat.id,
      label: cat.label,
      icon:  cat.icon,
      color: cat.color,
      items: cat.items
        .filter((i) => i.quantity < i.minimum)
        .map((i) => ({
          id:       i.id,
          name:     i.name,
          quantity: i.quantity,
          minimum:  i.minimum,
          unit:     i.unit,
          missing:  i.minimum - i.quantity,
        })),
    }))
    .filter((cat) => cat.items.length > 0);

  const totalItems = shoppingList.reduce((s, c) => s + c.items.length, 0);
  return c.json({ shoppingList, totalItems });
});
