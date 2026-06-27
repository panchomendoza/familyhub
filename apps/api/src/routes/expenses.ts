import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { requireAuth, requireCsrf, requireFamilyMember } from "../middleware/auth.js";
import type { AppEnv } from "../lib/hono.js";

export const expensesRoutes = new Hono<AppEnv>();

expensesRoutes.use("*", requireAuth);

// ── Default categories ──
const DEFAULT_CATEGORIES = [
  { label: "Necesidades",   icon: "🏠", color: "#4F7BF7", order: 0 },
  { label: "Suscripciones", icon: "📱", color: "#A44FF7", order: 1 },
  { label: "Cuotas",        icon: "💳", color: "#F74F7B", order: 2 },
  { label: "Ocio",          icon: "🎯", color: "#F7874F", order: 3 },
  { label: "Ahorro",        icon: "🐷", color: "#34C78A", order: 4 },
  { label: "Otros",         icon: "📦", color: "#8A93A8", order: 5 },
] as const;

// ── Schemas ──
const importSchema = z.object({
  fromYear:  z.number().int(),
  fromMonth: z.number().int().min(1).max(12),
  ids:       z.array(z.string()).min(1).max(100),
});

const categorySchema = z.object({
  label: z.string().min(1).max(60).trim(),
  icon:  z.string().min(1).max(10),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order: z.number().int().min(0).optional(),
});

const bankSchema = z.object({
  name:  z.string().min(1).max(80).trim(),
  order: z.number().int().min(0).optional(),
});

const MAX_CATEGORIES = 10;
const MAX_BANKS      = 10;

const expenseSchema = z.object({
  categoryId:   z.string().optional().nullable(),
  name:         z.string().min(1).max(200).trim(),
  bank:         z.string().max(80).trim().default(""),
  amount:       z.number().positive(),
  notes:        z.string().max(500).optional().nullable(),
  installments: z.number().int().min(0).default(0),
  paid:         z.boolean().default(false),
});

const updateIncomeSchema = z.object({
  income: z.number().min(0),
});

// ══════════════════════════════════════════
//   CATEGORIES
// ══════════════════════════════════════════

// GET /expenses/:familyId/categories
expensesRoutes.get("/:familyId/categories", requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const categories = await db.expenseCategory.findMany({
    where:   { familyId },
    orderBy: { order: "asc" },
  });
  return c.json({ categories });
});

// POST /expenses/:familyId/categories/seed
expensesRoutes.post("/:familyId/categories/seed", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;

  const existing = await db.expenseCategory.count({ where: { familyId } });
  if (existing > 0) {
    return c.json({ ok: false, message: "Ya existen categorías para esta familia" }, 409);
  }

  const categories = await db.$transaction(
    DEFAULT_CATEGORIES.map(cat =>
      db.expenseCategory.create({ data: { familyId, ...cat } })
    )
  );
  return c.json({ categories }, 201);
});

// POST /expenses/:familyId/categories
expensesRoutes.post("/:familyId/categories", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const body     = await c.req.json().catch(() => ({}));
  const parsed   = categorySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const count = await db.expenseCategory.count({ where: { familyId } });
  if (count >= MAX_CATEGORIES) {
    return c.json({ error: `Límite de ${MAX_CATEGORIES} categorías alcanzado` }, 422);
  }

  const maxOrder = await db.expenseCategory.aggregate({ where: { familyId }, _max: { order: true } });
  const category = await db.expenseCategory.create({
    data: {
      familyId,
      ...parsed.data,
      order: parsed.data.order ?? (maxOrder._max.order ?? 0) + 1,
    },
  });
  return c.json({ category }, 201);
});

// PATCH /expenses/:familyId/categories/:catId
expensesRoutes.patch("/:familyId/categories/:catId", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const catId    = c.req.param("catId");

  const existing = await db.expenseCategory.findFirst({ where: { id: catId, familyId } });
  if (!existing) return c.json({ error: "Categoría no encontrada" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = categorySchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const category = await db.expenseCategory.update({ where: { id: catId }, data: parsed.data });
  return c.json({ category });
});

// DELETE /expenses/:familyId/categories/:catId
expensesRoutes.delete("/:familyId/categories/:catId", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const catId    = c.req.param("catId");

  const existing = await db.expenseCategory.findFirst({ where: { id: catId, familyId } });
  if (!existing) return c.json({ error: "Categoría no encontrada" }, 404);

  const usageCount = await db.expense.count({ where: { categoryId: catId } });
  if (usageCount > 0) {
    return c.json({
      error: `No puedes eliminar esta categoría: está siendo usada en ${usageCount} gasto${usageCount !== 1 ? "s" : ""}.`,
    }, 409);
  }

  await db.expenseCategory.delete({ where: { id: catId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   BANKS
// ══════════════════════════════════════════

// GET /expenses/:familyId/banks
expensesRoutes.get("/:familyId/banks", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const banks    = await db.expenseBank.findMany({
    where:   { familyId },
    orderBy: { order: "asc" },
  });
  return c.json({ banks });
});

// POST /expenses/:familyId/banks
expensesRoutes.post("/:familyId/banks", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const body     = await c.req.json().catch(() => ({}));
  const parsed   = bankSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const count = await db.expenseBank.count({ where: { familyId } });
  if (count >= MAX_BANKS) {
    return c.json({ error: `Límite de ${MAX_BANKS} bancos alcanzado` }, 422);
  }

  const maxOrder = await db.expenseBank.aggregate({ where: { familyId }, _max: { order: true } });
  const bank     = await db.expenseBank.create({
    data: {
      familyId,
      name:  parsed.data.name,
      order: parsed.data.order ?? (maxOrder._max.order ?? 0) + 1,
    },
  });
  return c.json({ bank }, 201);
});

// PATCH /expenses/:familyId/banks/:bankId
expensesRoutes.patch("/:familyId/banks/:bankId", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const bankId   = c.req.param("bankId");

  const existing = await db.expenseBank.findFirst({ where: { id: bankId, familyId } });
  if (!existing) return c.json({ error: "Banco no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = bankSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const bank = await db.expenseBank.update({ where: { id: bankId }, data: parsed.data });
  return c.json({ bank });
});

// DELETE /expenses/:familyId/banks/:bankId
expensesRoutes.delete("/:familyId/banks/:bankId", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const bankId   = c.req.param("bankId");

  const existing = await db.expenseBank.findFirst({ where: { id: bankId, familyId } });
  if (!existing) return c.json({ error: "Banco no encontrado" }, 404);

  const usageCount = await db.expense.count({
    where: { bank: existing.name, month: { familyId } },
  });
  if (usageCount > 0) {
    return c.json({
      error: `No puedes eliminar "${existing.name}": está siendo usado en ${usageCount} gasto${usageCount !== 1 ? "s" : ""}.`,
    }, 409);
  }

  await db.expenseBank.delete({ where: { id: bankId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   MONTHS
// ══════════════════════════════════════════

// GET /expenses/:familyId/months
expensesRoutes.get("/:familyId/months", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const months   = await db.expenseMonth.findMany({
    where:   { familyId },
    include: { expenses: { include: { category: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return c.json({ months });
});

// GET /expenses/:familyId/months/current
expensesRoutes.get("/:familyId/months/current", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const now      = new Date();
  const year     = now.getFullYear();
  const month    = now.getMonth();

  let record = await db.expenseMonth.findUnique({
    where:   { familyId_year_month: { familyId, year, month } },
    include: { expenses: { include: { category: true }, orderBy: { createdAt: "asc" } } },
  });

  if (!record) {
    record = await createMonthWithInheritance(familyId, year, month);
  }

  return c.json({ month: record });
});

// GET /expenses/:familyId/months/:year/:month
expensesRoutes.get("/:familyId/months/:year/:month", requireFamilyMember(), async (c) => {
  const familyId   = c.get("familyId") as string;
  const year       = parseInt(c.req.param("year"), 10);
  const monthParam = parseInt(c.req.param("month"), 10);

  if (isNaN(year) || isNaN(monthParam) || monthParam < 1 || monthParam > 12) {
    return c.json({ error: "Parámetros inválidos" }, 400);
  }
  const month = monthParam - 1;

  let record = await db.expenseMonth.findUnique({
    where:   { familyId_year_month: { familyId, year, month } },
    include: { expenses: { include: { category: true }, orderBy: { createdAt: "asc" } } },
  });

  if (!record) {
    record = await createMonthWithInheritance(familyId, year, month);
  }

  return c.json({ month: record });
});

// PATCH /expenses/:familyId/months/:year/:month — update income
expensesRoutes.patch("/:familyId/months/:year/:month", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId   = c.get("familyId") as string;
  const year       = parseInt(c.req.param("year"), 10);
  const month      = parseInt(c.req.param("month"), 10) - 1;

  const body   = await c.req.json().catch(() => ({}));
  const parsed = updateIncomeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const record = await db.expenseMonth.upsert({
    where:  { familyId_year_month: { familyId, year, month } },
    create: { familyId, year, month, income: parsed.data.income },
    update: { income: parsed.data.income },
  });

  return c.json({ month: record });
});

// ══════════════════════════════════════════
//   EXPENSES
// ══════════════════════════════════════════

// POST /expenses/:familyId/months/:year/:month/expenses
expensesRoutes.post("/:familyId/months/:year/:month/expenses", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const year     = parseInt(c.req.param("year"), 10);
  const month    = parseInt(c.req.param("month"), 10) - 1;

  const body   = await c.req.json().catch(() => ({}));
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  let record = await db.expenseMonth.findUnique({
    where: { familyId_year_month: { familyId, year, month } },
  });
  if (!record) {
    record = await createMonthWithInheritance(familyId, year, month);
  }

  if (record.closed) {
    return c.json({ error: "Este mes está cerrado" }, 400);
  }

  const installments       = parsed.data.installments ?? 0;
  const installmentGroupId = installments > 1 ? nanoid() : null;

  if (installments > 1) {
    const createdExpenses = await db.$transaction(async (tx) => {
      const results = [];
      for (let i = 0; i < installments; i++) {
        const targetMonth = month + i;
        const targetYear  = year + Math.floor(targetMonth / 12);
        const normalMonth = targetMonth % 12;

        let targetRecord = await tx.expenseMonth.findUnique({
          where: { familyId_year_month: { familyId, year: targetYear, month: normalMonth } },
        });
        if (!targetRecord) {
          targetRecord = await tx.expenseMonth.create({
            data: { familyId, year: targetYear, month: normalMonth },
          });
        }

        const expense = await tx.expense.create({
          data: {
            monthId:            targetRecord.id,
            categoryId:         parsed.data.categoryId,
            name:               parsed.data.name,
            bank:               parsed.data.bank,
            amount:             parsed.data.amount,
            notes:              parsed.data.notes,
            installments,
            currentInstallment: i + 1,
            paid:               false,
            installmentGroupId,
          },
        });
        results.push(expense);
      }
      return results;
    });
    return c.json({ expenses: createdExpenses }, 201);
  }

  const expense = await db.expense.create({
    data: {
      monthId:            record.id,
      categoryId:         parsed.data.categoryId,
      name:               parsed.data.name,
      bank:               parsed.data.bank,
      amount:             parsed.data.amount,
      notes:              parsed.data.notes,
      installments:       0,
      currentInstallment: 0,
      paid:               parsed.data.paid,
    },
  });
  return c.json({ expenses: [expense] }, 201);
});

// POST /expenses/:familyId/months/:year/:month/import — copiar gastos desde otro mes
expensesRoutes.post("/:familyId/months/:year/:month/import", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const year     = parseInt(c.req.param("year"),  10);
  const month    = parseInt(c.req.param("month"), 10) - 1;

  const body   = await c.req.json().catch(() => ({}));
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const { fromYear, ids } = parsed.data;
  const fromMonth         = parsed.data.fromMonth - 1;

  // Obtener el mes origen
  const sourceMonth = await db.expenseMonth.findUnique({
    where:   { familyId_year_month: { familyId, year: fromYear, month: fromMonth } },
    include: { expenses: true },
  });
  if (!sourceMonth) return c.json({ error: "Mes origen no encontrado" }, 404);

  // Filtrar solo los IDs pedidos que pertenecen al mes origen
  const toImport = sourceMonth.expenses.filter(e => ids.includes(e.id));
  if (toImport.length === 0) return c.json({ error: "Ningún gasto válido seleccionado" }, 400);

  // Obtener o crear el mes destino
  let targetMonth = await db.expenseMonth.findUnique({
    where: { familyId_year_month: { familyId, year, month } },
  });
  if (!targetMonth) {
    targetMonth = await createMonthWithInheritance(familyId, year, month);
  }
  if (targetMonth.closed) return c.json({ error: "El mes destino está cerrado" }, 400);

  // Filtrar los que ya existen en el mes destino (deduplicación por nombre)
  const existingInTarget = await db.expense.findMany({
    where:  { monthId: targetMonth.id },
    select: { name: true },
  });
  const existingNames = new Set(existingInTarget.map(e => e.name));
  const toCreate = toImport.filter(e => !existingNames.has(e.name));

  if (toCreate.length === 0) {
    return c.json({ imported: 0, skipped: toImport.length }, 201);
  }

  // Crear copias: sin cuotas, sin paid, sin installmentGroupId
  const created = await db.$transaction(
    toCreate.map(e =>
      db.expense.create({
        data: {
          monthId:            targetMonth!.id,
          categoryId:         e.categoryId,
          name:               e.name,
          bank:               e.bank,
          amount:             e.amount,
          notes:              e.notes,
          installments:       0,
          currentInstallment: 0,
          paid:               false,
        },
      })
    )
  );

  return c.json({ imported: created.length, skipped: toImport.length - toCreate.length }, 201);
});

// PATCH /expenses/:familyId/expenses/:expenseId
expensesRoutes.patch("/:familyId/expenses/:expenseId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const expenseId = c.req.param("expenseId");

  const existing = await db.expense.findFirst({
    where: { id: expenseId, month: { familyId } },
  });
  if (!existing) return c.json({ error: "Gasto no encontrado" }, 404);

  const body   = await c.req.json().catch(() => ({}));
  const parsed = expenseSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);

  const expense = await db.expense.update({
    where: { id: expenseId },
    data:  parsed.data,
  });
  return c.json({ expense });
});

// PATCH /expenses/:familyId/expenses/:expenseId/paid — toggle paid
expensesRoutes.patch("/:familyId/expenses/:expenseId/paid", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const expenseId = c.req.param("expenseId");

  const existing = await db.expense.findFirst({
    where: { id: expenseId, month: { familyId } },
  });
  if (!existing) return c.json({ error: "Gasto no encontrado" }, 404);

  const expense = await db.expense.update({
    where: { id: expenseId },
    data:  { paid: !existing.paid },
  });
  return c.json({ expense });
});

// DELETE /expenses/:familyId/expenses/:expenseId
expensesRoutes.delete("/:familyId/expenses/:expenseId", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const expenseId = c.req.param("expenseId");

  const existing = await db.expense.findFirst({
    where: { id: expenseId, month: { familyId } },
  });
  if (!existing) return c.json({ error: "Gasto no encontrado" }, 404);

  await db.expense.delete({ where: { id: expenseId } });
  return c.json({ ok: true });
});

// DELETE /expenses/:familyId/expenses/:expenseId/group — delete all installments
expensesRoutes.delete("/:familyId/expenses/:expenseId/group", requireCsrf, requireFamilyMember(), async (c) => {
  const familyId  = c.get("familyId") as string;
  const expenseId = c.req.param("expenseId");

  const existing = await db.expense.findFirst({
    where: { id: expenseId, month: { familyId } },
  });
  if (!existing) return c.json({ error: "Gasto no encontrado" }, 404);
  if (!existing.installmentGroupId) return c.json({ error: "Este gasto no tiene grupo de cuotas" }, 400);

  await db.expense.deleteMany({ where: { installmentGroupId: existing.installmentGroupId } });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════
//   ANALYSIS
// ══════════════════════════════════════════

// GET /expenses/:familyId/months/:year/:month/analysis
expensesRoutes.get("/:familyId/months/:year/:month/analysis", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const year     = parseInt(c.req.param("year"), 10);
  const month    = parseInt(c.req.param("month"), 10) - 1;

  const record = await db.expenseMonth.findUnique({
    where:   { familyId_year_month: { familyId, year, month } },
    include: { expenses: { include: { category: true } } },
  });

  if (!record) return c.json({ error: "Mes no encontrado" }, 404);

  const income      = record.income;
  const paid        = record.expenses.filter((e) => e.paid);
  const pending     = record.expenses.filter((e) => !e.paid);
  const totalSpent  = record.expenses.reduce((s, e) => s + e.amount, 0);
  const totalPaid   = paid.reduce((s, e) => s + e.amount, 0);
  const totalPending = pending.reduce((s, e) => s + e.amount, 0);

  const byCategory: Record<string, { label: string; color: string; icon: string; total: number }> = {};
  for (const e of record.expenses) {
    const key   = e.categoryId ?? "uncategorized";
    const label = e.category?.label ?? "Sin categoría";
    const color = e.category?.color ?? "#888";
    const icon  = e.category?.icon  ?? "📦";
    if (!byCategory[key]) byCategory[key] = { label, color, icon, total: 0 };
    byCategory[key]!.total += e.amount;
  }

  const analysis = {
    income,
    totalSpent,
    totalPaid,
    totalPending,
    balance:      income - totalSpent,
    spentPct:     income > 0 ? (totalSpent / income) * 100 : 0,
    byCategory:   Object.values(byCategory).sort((a, b) => b.total - a.total),
    budget503020: {
      needs:   income * 0.5,
      wants:   income * 0.3,
      savings: income * 0.2,
    },
  };

  return c.json({ analysis });
});

// ══════════════════════════════════════════
//   HELPERS
// ══════════════════════════════════════════

async function createMonthWithInheritance(familyId: string, year: number, month: number) {
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear  = month === 0 ? year - 1 : year;

  return db.$transaction(async (tx) => {
    const newMonth = await tx.expenseMonth.create({
      data: { familyId, year, month },
    });

    const prevRecord = await tx.expenseMonth.findUnique({
      where:   { familyId_year_month: { familyId, year: prevYear, month: prevMonth } },
      include: {
        expenses: {
          where: {
            installments:       { gt: 0 },
            installmentGroupId: { not: null },
          },
        },
      },
    });

    if (prevRecord) {
      const inheritedGroups = new Set<string>();
      for (const e of prevRecord.expenses) {
        if (!e.installmentGroupId || inheritedGroups.has(e.installmentGroupId)) continue;

        const nextInstallment = await tx.expense.findFirst({
          where: { installmentGroupId: e.installmentGroupId, monthId: newMonth.id },
        });
        if (!nextInstallment && e.currentInstallment < e.installments) {
          await tx.expense.create({
            data: {
              monthId:            newMonth.id,
              categoryId:         e.categoryId,
              name:               e.name,
              bank:               e.bank,
              amount:             e.amount,
              installments:       e.installments,
              currentInstallment: e.currentInstallment + 1,
              installmentGroupId: e.installmentGroupId,
              paid:               false,
            },
          });
          inheritedGroups.add(e.installmentGroupId);
        }
      }
    }

    return tx.expenseMonth.findUnique({
      where:   { id: newMonth.id },
      include: { expenses: { include: { category: true }, orderBy: { createdAt: "asc" } } },
    }) as Promise<NonNullable<Awaited<ReturnType<typeof tx.expenseMonth.findUnique>>>>;
  });
}
