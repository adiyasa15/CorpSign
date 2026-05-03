import { Router } from "express";
import { db } from "@workspace/db";
import { userGroupsTable, packagesTable, usersTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireSuperAdmin, requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const GroupBody = z.object({
  name: z.string().min(1).max(100),
  companyName: z.string().optional(),
  packageId: z.number().int().nullable().optional(),
});

router.get("/user-groups", requireSuperAdmin, async (req, res) => {
  try {
    const groups = await db.select({
      id: userGroupsTable.id,
      name: userGroupsTable.name,
      companyName: userGroupsTable.companyName,
      packageId: userGroupsTable.packageId,
      isActive: userGroupsTable.isActive,
      expiresAt: userGroupsTable.expiresAt,
      activatedAt: userGroupsTable.activatedAt,
      createdAt: userGroupsTable.createdAt,
      updatedAt: userGroupsTable.updatedAt,
    }).from(userGroupsTable).orderBy(userGroupsTable.createdAt);

    const result = await Promise.all(groups.map(async (g) => {
      const [{ memberCount }] = await db
        .select({ memberCount: count() })
        .from(usersTable)
        .where(eq(usersTable.groupId, g.id));
      let pkg = null;
      if (g.packageId) {
        const [p] = await db.select().from(packagesTable).where(eq(packagesTable.id, g.packageId));
        pkg = p ?? null;
      }
      return { ...g, memberCount: Number(memberCount), package: pkg };
    }));

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/user-groups/public", async (req, res) => {
  try {
    const groups = await db.select({
      id: userGroupsTable.id,
      name: userGroupsTable.name,
      companyName: userGroupsTable.companyName,
    }).from(userGroupsTable).where(eq(userGroupsTable.isActive, true));
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/user-groups", requireSuperAdmin, async (req, res) => {
  try {
    const parsed = GroupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const [existing] = await db.select().from(userGroupsTable).where(eq(userGroupsTable.name, parsed.data.name));
    if (existing) { res.status(409).json({ error: "Group name already exists" }); return; }
    const [group] = await db.insert(userGroupsTable).values({
      name: parsed.data.name,
      companyName: parsed.data.companyName ?? null,
      packageId: parsed.data.packageId ?? null,
      isActive: false,
    }).returning();
    res.status(201).json(group);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/user-groups/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = GroupBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const [existing] = await db.select().from(userGroupsTable).where(eq(userGroupsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const [updated] = await db.update(userGroupsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(userGroupsTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/user-groups/:id/activate", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [group] = await db.select().from(userGroupsTable).where(eq(userGroupsTable.id, id));
    if (!group) { res.status(404).json({ error: "Not found" }); return; }

    let expiresAt: Date | null = null;
    if (group.packageId) {
      const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, group.packageId));
      if (pkg) {
        const now = new Date();
        expiresAt = new Date(now.getTime() + pkg.activeDays * 24 * 60 * 60 * 1000);
      }
    }

    const [updated] = await db.update(userGroupsTable)
      .set({ isActive: true, activatedAt: new Date(), expiresAt, updatedAt: new Date() })
      .where(eq(userGroupsTable.id, id))
      .returning();

    await db.update(usersTable)
      .set({ isActive: true, pendingApproval: false, updatedAt: new Date() })
      .where(eq(usersTable.groupId, id));

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/user-groups/:id/suspend", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [group] = await db.select().from(userGroupsTable).where(eq(userGroupsTable.id, id));
    if (!group) { res.status(404).json({ error: "Not found" }); return; }
    const [updated] = await db.update(userGroupsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(userGroupsTable.id, id))
      .returning();
    await db.update(usersTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(usersTable.groupId, id));
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/user-groups/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(userGroupsTable).where(eq(userGroupsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(usersTable).set({ groupId: null, isGroupOwner: false, updatedAt: new Date() }).where(eq(usersTable.groupId, id));
    await db.delete(userGroupsTable).where(eq(userGroupsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/user-groups/:id/members", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const role = req.user!.role;
    if (role !== "superadmin") {
      const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
      if (!caller || caller.groupId !== id || !caller.isGroupOwner) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    const members = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
      isActive: usersTable.isActive,
      isGroupOwner: usersTable.isGroupOwner,
      pendingApproval: usersTable.pendingApproval,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.groupId, id));
    res.json(members);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/user-groups/:id/members/:userId/activate", requireAuth, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const role = req.user!.role;
    if (role !== "superadmin") {
      const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
      if (!caller || caller.groupId !== groupId || !caller.isGroupOwner) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!target || target.groupId !== groupId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [updated] = await db.update(usersTable)
      .set({ isActive: true, pendingApproval: false, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();
    res.json({ id: updated.id, isActive: updated.isActive });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/user-groups/:id/members/:userId/suspend", requireAuth, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const role = req.user!.role;
    if (role !== "superadmin") {
      const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
      if (!caller || caller.groupId !== groupId || !caller.isGroupOwner) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!target || target.groupId !== groupId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [updated] = await db.update(usersTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();
    res.json({ id: updated.id, isActive: updated.isActive });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
