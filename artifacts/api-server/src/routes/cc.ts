import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, documentCcTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/documents/:id/cc", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const rows = await db
      .select({
        id: documentCcTable.id,
        userId: documentCcTable.userId,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        createdAt: documentCcTable.createdAt,
      })
      .from(documentCcTable)
      .innerJoin(usersTable, eq(documentCcTable.userId, usersTable.id))
      .where(eq(documentCcTable.documentId, docId))
      .orderBy(documentCcTable.createdAt);
    res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/cc", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const actor = req.user!;

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (doc.uploadedById !== actor.id && actor.role !== "admin" && actor.role !== "superadmin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const { userId } = req.body as { userId: number };
    if (!userId) { res.status(400).json({ error: "userId required" }); return; }

    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!targetUser || !targetUser.isActive) {
      res.status(400).json({ error: "User not found or inactive" }); return;
    }

    const [existing] = await db.select().from(documentCcTable)
      .where(and(eq(documentCcTable.documentId, docId), eq(documentCcTable.userId, userId)));
    if (existing) { res.status(409).json({ error: "User already in CC" }); return; }

    const [cc] = await db.insert(documentCcTable).values({
      documentId: docId,
      userId,
      addedById: actor.id,
    }).returning();

    res.status(201).json({
      id: cc.id,
      userId: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      createdAt: cc.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/documents/:id/cc/:ccId", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const ccId = Number(req.params.ccId);
    const actor = req.user!;

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (doc.uploadedById !== actor.id && actor.role !== "admin" && actor.role !== "superadmin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    await db.delete(documentCcTable)
      .where(and(eq(documentCcTable.id, ccId), eq(documentCcTable.documentId, docId)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
