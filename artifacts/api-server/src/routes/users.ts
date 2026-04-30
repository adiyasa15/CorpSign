import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, or, ilike, and } from "drizzle-orm";
import { requireAdminOrSuperAdmin, requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

router.get("/users/search", requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 1) { res.json([]); return; }
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(and(
        eq(usersTable.isActive, true),
        or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.email, `%${q}%`))
      ))
      .limit(10);
    res.json(users);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const CreateUserBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  companyName: z.string().optional(),
  division: z.string().optional(),
  role: z.enum(["admin", "user", "approver"]),
  password: z.string().min(6).optional(),
});

const UpdateUserBody = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  companyName: z.string().optional(),
  division: z.string().optional(),
  role: z.enum(["admin", "user", "approver"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

router.get("/users", requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      companyName: usersTable.companyName,
      division: usersTable.division,
      role: usersTable.role,
      isActive: usersTable.isActive,
      googleId: usersTable.googleId,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    }).from(usersTable).orderBy(usersTable.createdAt);
    res.json(users.map(formatUser));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      companyName: usersTable.companyName,
      division: usersTable.division,
      role: usersTable.role,
      isActive: usersTable.isActive,
      googleId: usersTable.googleId,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    }).from(usersTable).where(eq(usersTable.id, req.user!.id));
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(formatUser(user));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users", requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const body = CreateUserBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body", details: body.error.flatten() });
      return;
    }

    const { password, ...rest } = body.data;
    const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, rest.email));
    if (existing) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }

    const [user] = await db.insert(usersTable).values({
      ...rest,
      passwordHash,
      isActive: true,
    }).returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      companyName: usersTable.companyName,
      division: usersTable.division,
      role: usersTable.role,
      isActive: usersTable.isActive,
      googleId: usersTable.googleId,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    });

    res.status(201).json(formatUser(user));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/:id", requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateUserBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body", details: body.error.flatten() });
      return;
    }

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!target) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (target.role === "superadmin" && req.user!.role !== "superadmin") {
      res.status(403).json({ error: "Cannot modify superadmin" });
      return;
    }

    const { password, ...rest } = body.data;
    const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

    const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (passwordHash) updateData.passwordHash = passwordHash;

    const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      companyName: usersTable.companyName,
      division: usersTable.division,
      role: usersTable.role,
      isActive: usersTable.isActive,
      googleId: usersTable.googleId,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    });

    res.json(formatUser(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/:id", requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!target) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (target.role === "superadmin") {
      res.status(403).json({ error: "Cannot delete superadmin" });
      return;
    }
    if (target.id === req.user!.id) {
      res.status(403).json({ error: "Cannot delete your own account" });
      return;
    }
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatUser(user: {
  id: number;
  name: string;
  email: string;
  phone: string;
  companyName: string | null;
  division: string | null;
  role: string;
  isActive: boolean;
  googleId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    companyName: user.companyName ?? null,
    division: user.division ?? null,
    role: user.role,
    isActive: user.isActive,
    hasGoogleSSO: !!user.googleId,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export default router;
