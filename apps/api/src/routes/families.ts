import { Hono } from "hono";
import { z } from "zod";
import { customAlphabet } from "nanoid";

const nanoidAlpha = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6); // sin 0/O ni 1/I para evitar confusión
import { db } from "../lib/db.js";
import { requireAuth, requireCsrf, requireFamilyMember } from "../middleware/auth.js";
import type { AppEnv } from "../lib/hono.js";
import type { DashboardId } from "@familyhub/types";

export const familyRoutes = new Hono<AppEnv>();

// Todos los endpoints requieren auth
familyRoutes.use("*", requireAuth);

// ── Schemas ──
const createFamilySchema = z.object({
  name: z.string().min(2).max(80).trim(),
});

const joinFamilySchema = z.object({
  inviteCode: z.string().length(6).toUpperCase(),
});

const updateFamilySchema = z.object({
  name: z.string().min(2).max(80).trim(),
});

const updateMemberSchema = z.object({
  role:            z.enum(["admin", "member"]).optional(),
  dashboardAccess: z.array(z.enum(["health", "stock", "expenses", "tasks", "vehicles", "medicines"])).optional(),
});

// ══════════════════════════════════════════
//   POST /families — crear familia
// ══════════════════════════════════════════
familyRoutes.post("/", requireCsrf, async (c) => {
  const userId = c.get("userId") as string;
  const body   = await c.req.json().catch(() => ({}));
  const parsed = createFamilySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);
  }

  const inviteCode = nanoidAlpha();

  const family = await db.$transaction(async (tx: typeof db) => {
    const f = await tx.family.create({
      data: {
        name: parsed.data.name,
        inviteCode,
      },
    });

    await tx.familyMember.create({
      data: {
        userId,
        familyId:        f.id,
        role:            "admin",
        dashboardAccess: ["health", "stock", "expenses"], // admin: acceso total
      },
    });

    return f;
  });

  return c.json(await getFamilyWithMembers(family.id, userId), 201);
});

// ══════════════════════════════════════════
//   GET /families/my — familias del usuario
// ══════════════════════════════════════════
familyRoutes.get("/my", async (c) => {
  const userId = c.get("userId") as string;

  const memberships = await db.familyMember.findMany({
    where:   { userId },
    include: {
      family: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
          },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const families = memberships.map((m: (typeof memberships)[number]) => formatFamily(m.family, userId));
  return c.json({ families });
});

// ══════════════════════════════════════════
//   POST /families/join — unirse con código
// ══════════════════════════════════════════
familyRoutes.post("/join", requireCsrf, async (c) => {
  const userId = c.get("userId") as string;
  const body   = await c.req.json().catch(() => ({}));
  const parsed = joinFamilySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Código inválido" }, 400);
  }

  const family = await db.family.findUnique({
    where: { inviteCode: parsed.data.inviteCode },
  });

  if (!family) {
    return c.json({ error: "Código de invitación no encontrado" }, 404);
  }

  // Verificar que no sea ya miembro
  const existing = await db.familyMember.findUnique({
    where: { userId_familyId: { userId, familyId: family.id } },
  });

  if (existing) {
    return c.json({ error: "Ya eres miembro de este hogar" }, 409);
  }

  await db.familyMember.create({
    data: {
      userId,
      familyId:        family.id,
      role:            "member",
      dashboardAccess: ["health", "stock"], // miembro nuevo: sin gastos por defecto
    },
  });

  return c.json(await getFamilyWithMembers(family.id, userId), 201);
});

// ══════════════════════════════════════════
//   GET /families/:familyId
// ══════════════════════════════════════════
familyRoutes.get("/:familyId", requireFamilyMember(), async (c) => {
  const familyId = c.get("familyId") as string;
  const userId   = c.get("userId") as string;
  return c.json(await getFamilyWithMembers(familyId, userId));
});

// ══════════════════════════════════════════
//   PATCH /families/:familyId — renombrar (admin)
// ══════════════════════════════════════════
familyRoutes.patch("/:familyId", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId = c.get("familyId") as string;
  const body     = await c.req.json().catch(() => ({}));
  const parsed   = updateFamilySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);
  }

  const family = await db.family.update({
    where: { id: familyId },
    data:  { name: parsed.data.name },
  });

  return c.json({ family });
});

// ══════════════════════════════════════════
//   POST /families/:familyId/invite — regenerar código (admin)
// ══════════════════════════════════════════
familyRoutes.post("/:familyId/invite", requireCsrf, requireFamilyMember("admin"), async (c) => {
  const familyId  = c.get("familyId") as string;
  const newCode   = nanoidAlpha();

  const family = await db.family.update({
    where: { id: familyId },
    data:  { inviteCode: newCode },
  });

  return c.json({ inviteCode: family.inviteCode });
});

// ══════════════════════════════════════════
//   PATCH /families/:familyId/members/:memberId — actualizar rol/permisos (admin)
// ══════════════════════════════════════════
familyRoutes.patch(
  "/:familyId/members/:memberId",
  requireCsrf,
  requireFamilyMember("admin"),
  async (c) => {
    const familyId = c.get("familyId") as string;
    const memberId = c.req.param("memberId");
    const userId   = c.get("userId") as string;

    const body   = await c.req.json().catch(() => ({}));
    const parsed = updateMemberSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);
    }

    // No puede degradarse a sí mismo si es el único admin
    if (parsed.data.role === "member") {
      const memberToUpdate = await db.familyMember.findUnique({
        where: { id: memberId },
      });
      if (memberToUpdate?.userId === userId) {
        const adminCount = await db.familyMember.count({
          where: { familyId, role: "admin" },
        });
        if (adminCount <= 1) {
          return c.json({ error: "Debe haber al menos un administrador" }, 400);
        }
      }
    }

    const member = await db.familyMember.update({
      where: { id: memberId },
      data:  {
        ...(parsed.data.role            !== undefined && { role: parsed.data.role }),
        ...(parsed.data.dashboardAccess !== undefined && { dashboardAccess: parsed.data.dashboardAccess }),
      },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });

    return c.json({ member: formatMember(member) });
  }
);

// ══════════════════════════════════════════
//   DELETE /families/:familyId/members/:memberId — expulsar (admin) o salir (self)
// ══════════════════════════════════════════
familyRoutes.delete(
  "/:familyId/members/:memberId",
  requireCsrf,
  requireFamilyMember(),
  async (c) => {
    const familyId      = c.get("familyId") as string;
    const memberId      = c.req.param("memberId");
    const userId        = c.get("userId") as string;
    const currentMember = c.get("member") as { role: string; id: string };

    const targetMember = await db.familyMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.familyId !== familyId) {
      return c.json({ error: "Miembro no encontrado" }, 404);
    }

    const isSelf  = targetMember.userId === userId;
    const isAdmin = currentMember.role === "admin";

    if (!isSelf && !isAdmin) {
      return c.json({ error: "Sin permisos para expulsar miembros" }, 403);
    }

    // Si el último admin quiere salir, bloquear
    if (targetMember.role === "admin") {
      const adminCount = await db.familyMember.count({
        where: { familyId, role: "admin" },
      });
      if (adminCount <= 1) {
        return c.json({ error: "No puedes salir: eres el único administrador" }, 400);
      }
    }

    await db.familyMember.delete({ where: { id: memberId } });
    return c.json({ ok: true });
  }
);

// ══════════════════════════════════════════
//   HELPERS
// ══════════════════════════════════════════

async function getFamilyWithMembers(familyId: string, _userId: string) {
  const family = await db.family.findUnique({
    where:   { id: familyId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!family) return null;
  return formatFamily(family, _userId);
}

function formatFamily(
  family: {
    id: string;
    name: string;
    inviteCode: string;
    createdAt: Date;
    updatedAt: Date;
    members: Array<{
      id: string;
      userId: string;
      role: string;
      dashboardAccess: string[];
      joinedAt: Date;
      user: { id: string; name: string; email: string; avatarUrl: string | null };
    }>;
  },
  _userId: string
) {
  return {
    id:         family.id,
    name:       family.name,
    inviteCode: family.inviteCode,
    createdAt:  family.createdAt,
    members:    family.members.map(formatMember),
  };
}

function formatMember(m: {
  id: string;
  userId: string;
  role: string;
  dashboardAccess: string[];
  joinedAt: Date;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}) {
  return {
    id:              m.id,
    userId:          m.userId,
    name:            m.user.name,
    email:           m.user.email,
    avatarUrl:       m.user.avatarUrl,
    role:            m.role as "admin" | "member",
    dashboardAccess: m.dashboardAccess as DashboardId[],
    joinedAt:        m.joinedAt,
  };
}
