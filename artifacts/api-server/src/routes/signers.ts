import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, documentSignersTable, documentFieldsTable, documentAuditTable, documentCcTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generateSignedPDF, UPLOADS_DIR } from "./documents";
import { notifySignerCompleted, notifyDocumentCompleted } from "../lib/mailer";
import { telegramSignerCompleted, telegramDocumentCompleted } from "../lib/telegram";
import fs from "fs";
import path from "path";

async function getCcEmails(docId: number): Promise<string[]> {
  const rows = await db
    .select({ email: usersTable.email })
    .from(documentCcTable)
    .innerJoin(usersTable, eq(documentCcTable.userId, usersTable.id))
    .where(eq(documentCcTable.documentId, docId));
  return rows.map((r) => r.email);
}

async function getUploaderEmail(uploadedById: number | null): Promise<string | null> {
  if (!uploadedById) return null;
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, uploadedById));
  return u?.email ?? null;
}

const router = Router();

const SIGNER_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea",
  "#d97706", "#0891b2", "#be185d", "#4d7c0f",
];

router.get("/documents/:id/signers", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId)).orderBy(documentSignersTable.signerOrder);
    res.json(signers.map((s) => ({
      id: s.id, documentId: s.documentId, name: s.name, email: s.email,
      signerOrder: s.signerOrder, status: s.status, color: s.color,
      completedAt: s.completedAt?.toISOString() ?? null,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/signers", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const user = req.user!;

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (doc.uploadedById !== user.id && user.role !== "admin" && user.role !== "superadmin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const { name, email, signerOrder } = req.body as { name: string; email: string; signerOrder?: number };
    if (!name || !email) { res.status(400).json({ error: "name and email required" }); return; }

    const existing = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId));
    const order = signerOrder ?? existing.length;
    const color = SIGNER_COLORS[order % SIGNER_COLORS.length];

    const [signer] = await db.insert(documentSignersTable).values({
      documentId: docId,
      name,
      email,
      signerOrder: order,
      color,
    }).returning();

    res.status(201).json({
      id: signer.id, documentId: signer.documentId, name: signer.name, email: signer.email,
      signerOrder: signer.signerOrder, status: signer.status, color: signer.color,
      completedAt: null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/documents/:id/signers/:signerId", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const signerId = Number(req.params.signerId);
    const user = req.user!;

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (doc.uploadedById !== user.id && user.role !== "admin" && user.role !== "superadmin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    await db.delete(documentSignersTable).where(and(eq(documentSignersTable.id, signerId), eq(documentSignersTable.documentId, docId)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/documents/:id/signers/reorder", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const user = req.user!;
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (doc.uploadedById !== user.id && user.role !== "admin" && user.role !== "superadmin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { order } = req.body as { order: number[] };
    if (!Array.isArray(order)) { res.status(400).json({ error: "order array required" }); return; }
    await Promise.all(order.map((signerId, idx) =>
      db.update(documentSignersTable)
        .set({ signerOrder: idx })
        .where(and(eq(documentSignersTable.id, signerId), eq(documentSignersTable.documentId, docId)))
    ));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/documents/:id/fields", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const fields = await db.select().from(documentFieldsTable).where(eq(documentFieldsTable.documentId, docId));
    res.json(fields.map(formatField));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/fields", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const user = req.user!;

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (doc.uploadedById !== user.id && user.role !== "admin" && user.role !== "superadmin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const { signerId, fieldType, page, x, y, width, height } = req.body as {
      signerId: number; fieldType: string; page: number;
      x: number; y: number; width: number; height: number;
    };

    if (!signerId || !fieldType || page === undefined || x === undefined || y === undefined || !width || !height) {
      res.status(400).json({ error: "Missing required field properties" }); return;
    }

    const [field] = await db.insert(documentFieldsTable).values({
      documentId: docId,
      signerId,
      fieldType,
      page,
      x, y, width, height,
    }).returning();

    res.status(201).json(formatField(field));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/documents/:id/fields/:fieldId", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const fieldId = Number(req.params.fieldId);
    const user = req.user!;
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (doc.uploadedById !== user.id && user.role !== "admin" && user.role !== "superadmin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { x, y, width, height } = req.body as { x?: number; y?: number; width?: number; height?: number };
    const updates: Record<string, number> = {};
    if (x !== undefined) updates.x = x;
    if (y !== undefined) updates.y = y;
    if (width !== undefined) updates.width = width;
    if (height !== undefined) updates.height = height;
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No updates provided" }); return; }
    const [updated] = await db.update(documentFieldsTable)
      .set(updates)
      .where(and(eq(documentFieldsTable.id, fieldId), eq(documentFieldsTable.documentId, docId)))
      .returning();
    res.json(formatField(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/documents/:id/fields/:fieldId", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const fieldId = Number(req.params.fieldId);
    const user = req.user!;

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (doc.uploadedById !== user.id && user.role !== "admin" && user.role !== "superadmin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    await db.delete(documentFieldsTable).where(and(eq(documentFieldsTable.id, fieldId), eq(documentFieldsTable.documentId, docId)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/fields/:fieldId/fill", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const fieldId = Number(req.params.fieldId);
    const user = req.user!;
    const { imageData } = req.body as { imageData: string };

    if (!imageData) { res.status(400).json({ error: "imageData required" }); return; }

    const [field] = await db.select().from(documentFieldsTable).where(
      and(eq(documentFieldsTable.id, fieldId), eq(documentFieldsTable.documentId, docId))
    );
    if (!field) { res.status(404).json({ error: "Field not found" }); return; }

    const [signer] = await db.select().from(documentSignersTable).where(eq(documentSignersTable.id, field.signerId));
    if (!signer) { res.status(404).json({ error: "Signer not found" }); return; }

    const isAdmin = user.role === "admin" || user.role === "superadmin";
    const isOwner = (await db.select().from(documentsTable).where(eq(documentsTable.id, docId)))[0]?.uploadedById === user.id;
    const isSigner = signer.email === user.email;

    if (!isAdmin && !isOwner && !isSigner) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Sequential signing: all signers with lower signerOrder must be completed first
    const allSignersForCheck = await db.select().from(documentSignersTable)
      .where(eq(documentSignersTable.documentId, docId));
    const prevPending = allSignersForCheck.filter(
      (s) => s.signerOrder < signer.signerOrder && s.status !== "completed"
    );
    if (prevPending.length > 0) {
      res.status(403).json({ error: "It is not your turn to sign yet. Please wait for the previous signer to complete." });
      return;
    }

    await db.update(documentFieldsTable).set({ filledImage: imageData, filledAt: new Date() }).where(eq(documentFieldsTable.id, fieldId));

    await db.insert(documentAuditTable).values({
      documentId: docId,
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      actorIp: req.ip,
      eventType: "field_filled",
      details: { fieldType: field.fieldType, fieldId, signerEmail: signer.email },
    });

    const allFields = await db.select().from(documentFieldsTable).where(eq(documentFieldsTable.documentId, docId));
    const signerFields = allFields.filter((f) => f.signerId === signer.id);
    const allSignerFieldsFilled = signerFields.every((f) => f.filledImage || f.id === fieldId);

    if (allSignerFieldsFilled) {
      await db.update(documentSignersTable).set({ status: "completed", completedAt: new Date() }).where(eq(documentSignersTable.id, signer.id));
      await db.insert(documentAuditTable).values({
        documentId: docId, actorId: user.id, actorName: user.name,
        actorEmail: user.email, actorIp: req.ip, eventType: "signer_completed",
        details: { signerEmail: signer.email },
      });
    }

    const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId));
    const allSignersComplete = signers.every((s) => s.status === "completed" || (s.id === signer.id && allSignerFieldsFilled));

    if (allSignersComplete) {
      const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
      if (doc && doc.filePath) {
        await generateSignedPDF(docId, doc.filePath, {
          verificationToken: doc.verificationToken,
          sealQrCode: doc.sealQrCode,
          sealInvisibleLink: doc.sealInvisibleLink,
        });
      }
      await db.update(documentsTable).set({ status: "completed", signedAt: new Date(), updatedAt: new Date() }).where(eq(documentsTable.id, docId));
      await db.insert(documentAuditTable).values({
        documentId: docId, actorId: user.id, actorName: user.name,
        actorEmail: user.email, actorIp: req.ip, eventType: "document_completed",
      });

      // Notify: document completed
      const [completedDoc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
      const ccEmails = await getCcEmails(docId);
      const uploaderEmail = await getUploaderEmail(completedDoc?.uploadedById ?? null);
      const completedOpts = {
        docId,
        docTitle: completedDoc?.title ?? "",
        uploaderEmail: uploaderEmail ?? "",
        allSignerEmails: signers.map((s) => s.email),
        ccEmails,
      };
      notifyDocumentCompleted(completedOpts).catch(() => {});
      telegramDocumentCompleted(completedOpts).catch(() => {});
    } else if (allSignerFieldsFilled) {
      // Notify: this signer completed, nudge next pending signer
      const [incompleteDoc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
      const ccEmails = await getCcEmails(docId);
      const uploaderEmail = await getUploaderEmail(incompleteDoc?.uploadedById ?? null);
      // Find the next signer strictly by order (lowest signerOrder among pending)
      const nextSigner = signers
        .filter((s) => s.status !== "completed" && s.id !== signer.id)
        .sort((a, b) => a.signerOrder - b.signerOrder)[0];
      const signerOpts = {
        docId,
        docTitle: incompleteDoc?.title ?? "",
        signerName: signer.name,
        uploaderEmail: uploaderEmail ?? "",
        nextSigner: nextSigner ? { name: nextSigner.name, email: nextSigner.email } : undefined,
        ccEmails,
      };
      notifySignerCompleted(signerOpts).catch(() => {});
      telegramSignerCompleted(signerOpts).catch(() => {});
    }

    res.json({ ok: true, signerCompleted: allSignerFieldsFilled, documentCompleted: allSignersComplete });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatField(f: typeof documentFieldsTable.$inferSelect) {
  return {
    id: f.id, documentId: f.documentId, signerId: f.signerId,
    fieldType: f.fieldType, page: f.page,
    x: f.x, y: f.y, width: f.width, height: f.height,
    filledAt: f.filledAt?.toISOString() ?? null,
    filledImage: f.filledImage ?? null,
  };
}

export default router;
