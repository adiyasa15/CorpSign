import { Router } from "express";
import { db } from "@workspace/db";
import { packagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const PackageBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  type: z.enum(["free_trial", "subscribed", "custom"]),
  maxDocuments: z.number().int().min(1).nullable().optional(),
  maxSignersPerDoc: z.number().int().min(1).nullable().optional(),
  maxUploadMb: z.number().int().min(1).max(1000),
  maxUploaderUsers: z.number().int().min(1),
  maxTotalUsers: z.number().int().min(1),
  activeDays: z.number().int().min(1),
  isActive: z.boolean().optional(),
});

router.get("/packages/public", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.isActive, true))
      .orderBy(packagesTable.createdAt);
    res.json(rows.filter((p) => p.type === "subscribed" || p.type === "custom"));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/packages", requireSuperAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(packagesTable).orderBy(packagesTable.createdAt);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/packages", requireSuperAdmin, async (req, res) => {
  try {
    const parsed = PackageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const [pkg] = await db.insert(packagesTable).values({
      ...parsed.data,
      isActive: parsed.data.isActive ?? true,
    }).returning();
    res.status(201).json(pkg);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/packages/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = PackageBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const [existing] = await db.select().from(packagesTable).where(eq(packagesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const [updated] = await db.update(packagesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(packagesTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/packages/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(packagesTable).where(eq(packagesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(packagesTable).where(eq(packagesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
