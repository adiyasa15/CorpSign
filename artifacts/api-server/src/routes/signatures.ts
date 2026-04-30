import { Router } from "express";
import { db } from "@workspace/db";
import { signaturesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateSignatureBody, DeleteSignatureParams } from "@workspace/api-zod";

const router = Router();

router.get("/signatures", async (req, res) => {
  try {
    const sigs = await db.select().from(signaturesTable).orderBy(signaturesTable.createdAt);
    res.json(sigs.map(formatSignature));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/signatures", async (req, res) => {
  try {
    const body = CreateSignatureBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const [sig] = await db.insert(signaturesTable).values(body.data).returning();
    res.status(201).json(formatSignature(sig));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/signatures/:id", async (req, res) => {
  try {
    const params = DeleteSignatureParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    await db.delete(signaturesTable).where(eq(signaturesTable.id, params.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatSignature(sig: typeof signaturesTable.$inferSelect) {
  return {
    id: sig.id,
    name: sig.name,
    signatureData: sig.signatureData,
    type: sig.type,
    createdAt: sig.createdAt.toISOString(),
  };
}

export default router;
