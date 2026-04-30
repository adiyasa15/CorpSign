import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "@workspace/db";
import {
  documentsTable,
  activityTable,
  documentSignersTable,
  documentFieldsTable,
  documentAuditTable,
  documentCcTable,
  usersTable,
} from "@workspace/db";
import { eq, ilike, and, or, inArray } from "drizzle-orm";
import {
  ListDocumentsQueryParams,
  UpdateDocumentBody,
  UpdateDocumentParams,
  GetDocumentParams,
  DeleteDocumentParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  notifyDocumentSent,
  notifyDocumentCompleted,
  notifyDocumentRejected,
  notifyDocumentVoided,
} from "../lib/mailer";

const router = Router();

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
  const [u] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uploadedById));
  return u?.email ?? null;
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"));
    } else {
      cb(null, true);
    }
  },
});

function canSeeAllDocs(role: string) {
  return role === "admin" || role === "superadmin";
}

async function logAudit(
  documentId: number,
  actorId: number | null,
  actorName: string,
  actorEmail: string,
  actorIp: string | undefined,
  eventType: string,
  details?: object,
) {
  await db.insert(documentAuditTable).values({
    documentId,
    actorId,
    actorName,
    actorEmail,
    actorIp,
    eventType,
    details: details ?? null,
  });
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

    // Get CC'd document IDs for this user (all roles)
    const ccDocRows = await db
      .select({ documentId: documentCcTable.documentId })
      .from(documentCcTable)
      .where(eq(documentCcTable.userId, user.id));
    const ccDocIds = ccDocRows.map((r) => r.documentId);

    if (user.role === "approver") {
      const mySignerDocs = await db
        .select({ documentId: documentSignersTable.documentId })
        .from(documentSignersTable)
        .where(eq(documentSignersTable.email, user.email));
      const signerDocIds = mySignerDocs.map((r) => r.documentId);
      const allIds = [...new Set([...signerDocIds, ...ccDocIds])];
      if (allIds.length === 0) {
        res.json([]);
        return;
      }
      conditions.push(inArray(documentsTable.id, allIds));
    } else if (!canSeeAllDocs(user.role)) {
      // Regular users: own docs + docs where they are a signer + CC'd docs
      const mySignerDocs = await db
        .select({ documentId: documentSignersTable.documentId })
        .from(documentSignersTable)
        .where(eq(documentSignersTable.email, user.email));
      const signerDocIds = mySignerDocs.map((r) => r.documentId);
      const involvedIds = [...new Set([...signerDocIds, ...ccDocIds])];
      if (involvedIds.length > 0) {
        conditions.push(or(eq(documentsTable.uploadedById, user.id), inArray(documentsTable.id, involvedIds))!);
      } else {
        conditions.push(eq(documentsTable.uploadedById, user.id));
      }
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

router.post("/documents/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "approver") {
      res.status(403).json({ error: "Approvers cannot upload documents" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "PDF file is required" });
      return;
    }

    const { title, description } = req.body as { title?: string; description?: string };
    if (!title) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const [doc] = await db.insert(documentsTable).values({
      title,
      description: description || null,
      fileName: req.file.originalname,
      filePath: req.file.filename,
      fileSize: req.file.size,
      status: "draft",
      signerName: "",
      signerEmail: "",
      uploadedById: user.id,
    }).returning();

    await logAudit(doc.id, user.id, user.name, user.email, req.ip, "uploaded", {
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });

    await db.insert(activityTable).values({
      documentId: doc.id,
      documentTitle: doc.title,
      action: "uploaded",
      signerName: user.name,
    });

    res.status(201).json(formatDocument(doc));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/documents/:id/file", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc || !doc.filePath) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const user = req.user!;
    if (!canSeeAllDocs(user.role) && doc.uploadedById !== user.id) {
      const signer = await db
        .select()
        .from(documentSignersTable)
        .where(and(eq(documentSignersTable.documentId, docId), eq(documentSignersTable.email, user.email)));
      if (signer.length === 0) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const signedPath = path.join(UPLOADS_DIR, `signed_${doc.filePath}`);
    const originalPath = path.join(UPLOADS_DIR, doc.filePath);
    const filePath = fs.existsSync(signedPath) ? signedPath : originalPath;

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/documents/:id/download", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const mode = (req.query.mode as string) || "doc";
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const user = req.user!;
    if (!canSeeAllDocs(user.role) && doc.uploadedById !== user.id) {
      const signer = await db
        .select()
        .from(documentSignersTable)
        .where(and(eq(documentSignersTable.documentId, docId), eq(documentSignersTable.email, user.email)));
      if (signer.length === 0) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    await logAudit(doc.id, user.id, user.name, user.email, req.ip, "downloaded", { mode });

    if (mode === "coc") {
      const cocPdf = await generateCOC(doc, docId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="COC_${doc.fileName}"`);
      res.send(Buffer.from(cocPdf));
      return;
    }

    const signedPath = path.join(UPLOADS_DIR, `signed_${doc.filePath}`);
    const originalPath = path.join(UPLOADS_DIR, doc.filePath!);
    const docPath = fs.existsSync(signedPath) ? signedPath : originalPath;

    if (!fs.existsSync(docPath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    if (mode === "merged") {
      const docBytes = fs.readFileSync(docPath);
      const cocBytes = await generateCOC(doc, docId);

      const mergedPdf = await PDFDocument.create();
      const docPdf = await PDFDocument.load(docBytes);
      const cocPdf = await PDFDocument.load(cocBytes);
      const docPages = await mergedPdf.copyPages(docPdf, docPdf.getPageIndices());
      docPages.forEach((p) => mergedPdf.addPage(p));
      const cocPages = await mergedPdf.copyPages(cocPdf, cocPdf.getPageIndices());
      cocPages.forEach((p) => mergedPdf.addPage(p));

      const merged = await mergedPdf.save();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Signed_${doc.fileName}"`);
      res.send(Buffer.from(merged));
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Signed_${doc.fileName}"`);
    fs.createReadStream(docPath).pipe(res);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/documents/:id/audit", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const user = req.user!;
    if (!canSeeAllDocs(user.role) && doc.uploadedById !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const logs = await db
      .select()
      .from(documentAuditTable)
      .where(eq(documentAuditTable.documentId, docId))
      .orderBy(documentAuditTable.createdAt);

    res.json(logs.map((l) => ({
      id: l.id,
      actorName: l.actorName,
      actorEmail: l.actorEmail,
      eventType: l.eventType,
      details: l.details,
      createdAt: l.createdAt.toISOString(),
    })));
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
    const isOwner = doc.uploadedById === user.id;
    const isSigner = (await db.select().from(documentSignersTable).where(
      and(eq(documentSignersTable.documentId, doc.id), eq(documentSignersTable.email, user.email))
    )).length > 0;
    const isCc = (await db.select().from(documentCcTable).where(
      and(eq(documentCcTable.documentId, doc.id), eq(documentCcTable.userId, user.id))
    )).length > 0;

    if (!canSeeAllDocs(user.role) && !isOwner && !isSigner && !isCc) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, doc.id)).orderBy(documentSignersTable.signerOrder);
    const fields = await db.select().from(documentFieldsTable).where(eq(documentFieldsTable.documentId, doc.id));
    const ccList = await db
      .select({ id: documentCcTable.id, userId: documentCcTable.userId, name: usersTable.name, email: usersTable.email })
      .from(documentCcTable)
      .innerJoin(usersTable, eq(documentCcTable.userId, usersTable.id))
      .where(eq(documentCcTable.documentId, doc.id));

    res.json({
      ...formatDocument(doc),
      signers: signers.map(formatSigner),
      fields: fields.map(formatField),
      cc: ccList,
    });
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

    if (existing.filePath) {
      const filePath = path.join(UPLOADS_DIR, existing.filePath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      const signedPath = path.join(UPLOADS_DIR, `signed_${existing.filePath}`);
      if (fs.existsSync(signedPath)) fs.unlinkSync(signedPath);
    }

    await db.delete(documentsTable).where(eq(documentsTable.id, params.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/send", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const user = req.user!;

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (!canSeeAllDocs(user.role) && doc.uploadedById !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId));
    if (signers.length === 0) {
      res.status(400).json({ error: "Add at least one signer before sending" }); return;
    }
    const fields = await db.select().from(documentFieldsTable).where(eq(documentFieldsTable.documentId, docId));
    if (fields.length === 0) {
      res.status(400).json({ error: "Add at least one signing field before sending" }); return;
    }

    await db.update(documentsTable).set({ status: "in_progress", updatedAt: new Date() }).where(eq(documentsTable.id, docId));
    await logAudit(docId, user.id, user.name, user.email, req.ip, "sent_for_signing");

    await db.insert(activityTable).values({
      documentId: docId,
      documentTitle: doc.title,
      action: "uploaded",
      signerName: signers.map((s) => s.name).join(", "),
    });

    // Notify all parties (fire-and-forget)
    const ccEmails = await getCcEmails(docId);
    notifyDocumentSent({
      docId,
      docTitle: doc.title,
      uploaderName: user.name,
      uploaderEmail: user.email,
      signers: signers.map((s) => ({ name: s.name, email: s.email })),
      ccEmails,
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function generateSignedPDF(docId: number, filePath: string): Promise<string> {
  const pdfBytes = fs.readFileSync(path.join(UPLOADS_DIR, filePath));
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  const fields = await db.select().from(documentFieldsTable).where(eq(documentFieldsTable.documentId, docId));
  const filledFields = fields.filter((f) => f.filledImage);

  for (const field of filledFields) {
    const page = pages[field.page];
    if (!page) continue;
    const { width: pageWidth, height: pageHeight } = page.getSize();

    const imgData = field.filledImage!.replace(/^data:image\/png;base64,/, "");
    const imgBytes = Buffer.from(imgData, "base64");

    try {
      const img = await pdfDoc.embedPng(imgBytes);
      const fieldX = (field.x / 100) * pageWidth;
      const fieldY = pageHeight - ((field.y / 100) * pageHeight) - ((field.height / 100) * pageHeight);
      const fieldW = (field.width / 100) * pageWidth;
      const fieldH = (field.height / 100) * pageHeight;

      page.drawImage(img, {
        x: fieldX,
        y: fieldY,
        width: fieldW,
        height: fieldH,
      });
    } catch {
      // skip if image embedding fails
    }
  }

  const signedBytes = await pdfDoc.save();
  const signedFileName = `signed_${filePath}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, signedFileName), signedBytes);
  return signedFileName;
}

async function generateCOC(doc: typeof documentsTable.$inferSelect, docId: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595, 842]);
  const { height } = page.getSize();
  let y = height - 60;

  const draw = (text: string, size: number, bold = false, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x: 50, y, size, font: bold ? boldFont : font, color });
    y -= size + 6;
  };

  draw("CERTIFICATE OF COMPLETION", 18, true, rgb(0.1, 0.2, 0.6));
  draw("Chain of Custody / Audit Trail", 12, false, rgb(0.4, 0.4, 0.4));
  y -= 10;

  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 20;

  draw(`Document: ${doc.title}`, 11, true);
  draw(`File: ${doc.fileName}`, 10);
  draw(`Status: ${doc.status.toUpperCase()}`, 10);
  draw(`Created: ${doc.createdAt.toISOString()}`, 10);
  y -= 10;

  const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId)).orderBy(documentSignersTable.signerOrder);
  if (signers.length > 0) {
    draw("Signers:", 11, true);
    for (const s of signers) {
      draw(`  ${s.signerOrder + 1}. ${s.name} <${s.email}> — ${s.status.toUpperCase()}${s.completedAt ? ` (${s.completedAt.toISOString()})` : ""}`, 10);
    }
    y -= 10;
  }

  const auditLogs = await db.select().from(documentAuditTable).where(eq(documentAuditTable.documentId, docId)).orderBy(documentAuditTable.createdAt);

  draw("Audit Trail:", 11, true);
  y -= 5;

  for (const log of auditLogs) {
    const line = `${log.createdAt.toISOString().replace("T", " ").slice(0, 19)}  ${log.actorName} (${log.actorEmail})  →  ${log.eventType}`;
    if (y < 80) break;
    draw(line, 9, false, rgb(0.2, 0.2, 0.2));
  }

  y -= 20;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 15;
  draw("This document was processed by Tandatanganin — Digital Signature Platform", 8, false, rgb(0.5, 0.5, 0.5));

  return pdfDoc.save();
}

router.post("/documents/:id/void", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const user = req.user!;
    const { reason } = req.body as { reason?: string };

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    // Only uploader (or admin/superadmin) can void
    if (doc.uploadedById !== user.id && user.role !== "admin" && user.role !== "superadmin") {
      res.status(403).json({ error: "Only the document uploader can void this document" }); return;
    }

    // Can void if in_progress or draft
    if (!["draft", "in_progress"].includes(doc.status)) {
      res.status(400).json({ error: "Only draft or in-progress documents can be voided" }); return;
    }

    await db.update(documentsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(documentsTable.id, docId));
    await logAudit(docId, user.id, user.name, user.email, req.ip, "voided", { reason });

    // Notify
    const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId));
    const ccEmails = await getCcEmails(docId);
    const uploaderEmail = await getUploaderEmail(doc.uploadedById);

    notifyDocumentVoided({
      docId,
      docTitle: doc.title,
      voidedByName: user.name,
      reason,
      uploaderEmail: uploaderEmail ?? user.email,
      allSignerEmails: signers.map((s) => s.email),
      ccEmails,
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/reject", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const user = req.user!;
    const { reason } = req.body as { reason?: string };

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    // Signers can reject; admins/superadmin too
    const signer = (await db.select().from(documentSignersTable).where(
      and(eq(documentSignersTable.documentId, docId), eq(documentSignersTable.email, user.email))
    ))[0];
    const isAdmin = user.role === "admin" || user.role === "superadmin";
    if (!signer && !isAdmin) {
      res.status(403).json({ error: "Only assigned signers or admins can reject" }); return;
    }

    await db.update(documentsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(documentsTable.id, docId));
    await logAudit(docId, user.id, user.name, user.email, req.ip, "rejected", { reason });

    // Notify
    const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId));
    const ccEmails = await getCcEmails(docId);
    const uploaderEmail = await getUploaderEmail(doc.uploadedById);

    notifyDocumentRejected({
      docId,
      docTitle: doc.title,
      rejectedByName: user.name,
      rejectedByEmail: user.email,
      reason,
      uploaderEmail: uploaderEmail ?? "",
      otherSignerEmails: signers.filter((s) => s.email !== user.email).map((s) => s.email),
      ccEmails,
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/sign", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const user = req.user!;
    const { signatureData } = req.body as { signatureData?: string };

    const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    await db.update(documentsTable).set({
      status: "signed",
      signatureData: signatureData ?? null,
      signedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(documentsTable.id, docId));

    await db.insert(activityTable).values({
      documentId: docId,
      documentTitle: existing.title,
      action: "signed",
      signerName: user.name,
    });

    await logAudit(docId, user.id, user.name, user.email, req.ip, "signed");

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { generateSignedPDF, UPLOADS_DIR };

function formatDocument(doc: typeof documentsTable.$inferSelect) {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description ?? undefined,
    fileName: doc.fileName,
    filePath: doc.filePath ?? null,
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

function formatSigner(s: typeof documentSignersTable.$inferSelect) {
  return {
    id: s.id,
    documentId: s.documentId,
    name: s.name,
    email: s.email,
    signerOrder: s.signerOrder,
    status: s.status,
    color: s.color,
    completedAt: s.completedAt?.toISOString() ?? null,
  };
}

function formatField(f: typeof documentFieldsTable.$inferSelect) {
  return {
    id: f.id,
    documentId: f.documentId,
    signerId: f.signerId,
    fieldType: f.fieldType,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    filledAt: f.filledAt?.toISOString() ?? null,
    filledImage: f.filledImage ?? null,
  };
}

export default router;
