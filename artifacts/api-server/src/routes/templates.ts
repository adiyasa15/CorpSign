import { Router } from "express";
import { db } from "@workspace/db";
import { signatureTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/me/templates", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const templates = await db.select().from(signatureTemplatesTable).where(eq(signatureTemplatesTable.userId, user.id)).orderBy(signatureTemplatesTable.createdAt);
    res.json(templates.map(fmt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/me/templates", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { templateType, name, imageData, isDefault } = req.body as {
      templateType: string; name?: string; imageData: string; isDefault?: boolean;
    };

    if (!templateType || !imageData) {
      res.status(400).json({ error: "templateType and imageData required" }); return;
    }
    if (!["signature", "initial", "stamp"].includes(templateType)) {
      res.status(400).json({ error: "templateType must be signature, initial, or stamp" }); return;
    }

    if (isDefault) {
      await db.update(signatureTemplatesTable)
        .set({ isDefault: false })
        .where(and(eq(signatureTemplatesTable.userId, user.id), eq(signatureTemplatesTable.templateType, templateType)));
    }

    const [tpl] = await db.insert(signatureTemplatesTable).values({
      userId: user.id,
      templateType,
      name: name ?? null,
      imageData,
      isDefault: isDefault ?? false,
    }).returning();

    res.status(201).json(fmt(tpl));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/me/templates/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const tplId = Number(req.params.id);
    const { name, isDefault } = req.body as { name?: string; isDefault?: boolean };

    const [existing] = await db.select().from(signatureTemplatesTable).where(and(eq(signatureTemplatesTable.id, tplId), eq(signatureTemplatesTable.userId, user.id)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    if (isDefault) {
      await db.update(signatureTemplatesTable)
        .set({ isDefault: false })
        .where(and(eq(signatureTemplatesTable.userId, user.id), eq(signatureTemplatesTable.templateType, existing.templateType)));
    }

    const [tpl] = await db.update(signatureTemplatesTable)
      .set({ name: name ?? existing.name, isDefault: isDefault ?? existing.isDefault })
      .where(eq(signatureTemplatesTable.id, tplId))
      .returning();

    res.json(fmt(tpl));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/me/templates/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const tplId = Number(req.params.id);
    await db.delete(signatureTemplatesTable).where(and(eq(signatureTemplatesTable.id, tplId), eq(signatureTemplatesTable.userId, user.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function fmt(t: typeof signatureTemplatesTable.$inferSelect) {
  return {
    id: t.id, userId: t.userId, templateType: t.templateType,
    name: t.name ?? null, imageData: t.imageData,
    isDefault: t.isDefault, createdAt: t.createdAt.toISOString(),
  };
}

export default router;
