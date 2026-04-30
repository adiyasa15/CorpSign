import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, activityTable } from "@workspace/db";
import { eq, ilike, and, or } from "drizzle-orm";
import {
  ListDocumentsQueryParams,
  CreateDocumentBody,
  UpdateDocumentBody,
  UpdateDocumentParams,
  GetDocumentParams,
  DeleteDocumentParams,
  SignDocumentParams,
  SignDocumentBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function canSeeAllDocs(role: string) {
  return role === "admin" || role === "superadmin";
}

router.get("/documents", requireAuth, async (req, res) => {
  try {
    const query = ListDocumentsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }
    const { status, search } = query.data;
    const user = req.user!;

    const conditions = [];
    if (status && status !== "all") {
      conditions.push(eq(documentsTable.status, status as "pending" | "signed" | "rejected"));
    }
    if (search) {
      conditions.push(
        or(
          ilike(documentsTable.title, `%${search}%`),
          ilike(documentsTable.signerName, `%${search}%`),
          ilike(documentsTable.signerEmail, `%${search}%`),
        ),
      );
    }

    if (user.role === "approver") {
      conditions.push(
        and(
          eq(documentsTable.signerEmail, user.email),
          eq(documentsTable.status, "signed"),
        )!,
      );
    } else if (!canSeeAllDocs(user.role)) {
      conditions.push(eq(documentsTable.uploadedById, user.id));
    }

    const docs = conditions.length > 0
      ? await db.select().from(documentsTable).where(and(...conditions)).orderBy(documentsTable.createdAt)
      : await db.select().from(documentsTable).orderBy(documentsTable.createdAt);

    res.json(docs.map(formatDocument));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "approver") {
      res.status(403).json({ error: "Approvers cannot upload documents" });
      return;
    }

    const body = CreateDocumentBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const [doc] = await db.insert(documentsTable).values({
      ...body.data,
      status: "pending",
      uploadedById: user.id,
    }).returning();

    await db.insert(activityTable).values({
      documentId: doc.id,
      documentTitle: doc.title,
      action: "uploaded",
      signerName: doc.signerName,
    });

    res.status(201).json(formatDocument(doc));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/documents/:id", requireAuth, async (req, res) => {
  try {
    const params = GetDocumentParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const user = req.user!;
    if (!canSeeAllDocs(user.role) && user.role !== "approver") {
      if (doc.uploadedById !== user.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    if (user.role === "approver" && (doc.signerEmail !== user.email || doc.status !== "signed")) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json(formatDocument(doc));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/documents/:id", requireAuth, async (req, res) => {
  try {
    const params = UpdateDocumentParams.safeParse({ id: Number(req.params.id) });
    const body = UpdateDocumentBody.safeParse(req.body);

    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const user = req.user!;
    if (user.role === "approver") {
      res.status(403).json({ error: "Approvers cannot modify documents" });
      return;
    }

    const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!canSeeAllDocs(user.role) && existing.uploadedById !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [doc] = await db
      .update(documentsTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(documentsTable.id, params.data.id))
      .returning();

    res.json(formatDocument(doc));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/documents/:id", requireAuth, async (req, res) => {
  try {
    const params = DeleteDocumentParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const user = req.user!;
    if (user.role === "approver") {
      res.status(403).json({ error: "Approvers cannot delete documents" });
      return;
    }

    const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!canSeeAllDocs(user.role) && existing.uploadedById !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db.delete(documentsTable).where(eq(documentsTable.id, params.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/sign", requireAuth, async (req, res) => {
  try {
    const params = SignDocumentParams.safeParse({ id: Number(req.params.id) });
    const body = SignDocumentBody.safeParse(req.body);

    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const user = req.user!;
    const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!canSeeAllDocs(user.role) && user.role !== "approver") {
      if (existing.uploadedById !== user.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const [doc] = await db
      .update(documentsTable)
      .set({
        status: "signed",
        signatureData: body.data.signatureData,
        signedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documentsTable.id, params.data.id))
      .returning();

    await db.insert(activityTable).values({
      documentId: doc.id,
      documentTitle: doc.title,
      action: "signed",
      signerName: doc.signerName,
    });

    res.json(formatDocument(doc));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatDocument(doc: typeof documentsTable.$inferSelect) {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description ?? undefined,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    status: doc.status,
    signerName: doc.signerName,
    signerEmail: doc.signerEmail,
    uploadedById: doc.uploadedById ?? null,
    signedAt: doc.signedAt?.toISOString() ?? null,
    signatureData: doc.signatureData ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export default router;
