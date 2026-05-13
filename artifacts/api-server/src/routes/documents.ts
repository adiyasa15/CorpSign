import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  isGcsPath,
  getSignedGcsPath,
  uploadDocBuffer,
  uploadDocBufferAt,
  downloadDocBuffer,
  gcsFileExists,
  deleteDocFromStorage,
} from "../lib/docStorage";
import { db } from "@workspace/db";
import {
  documentsTable,
  activityTable,
  documentSignersTable,
  documentFieldsTable,
  documentAuditTable,
  documentCcTable,
  usersTable,
  privilegesTable,
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
import { PDFDocument, rgb, StandardFonts, PDFName, PDFArray, PDFString } from "pdf-lib";
import QRCode from "qrcode";
import { randomUUID } from "crypto";
import {
  notifyDocumentSent,
  notifyDocumentCompleted,
  notifyDocumentRejected,
  notifyDocumentVoided,
  sendReminderEmail,
} from "../lib/mailer";
import {
  telegramDocumentSent,
  telegramDocumentCompleted,
  telegramDocumentRejected,
  telegramDocumentVoided,
  telegramReminderNotification,
} from "../lib/telegram";
import {
  whatsappDocumentSent,
  whatsappDocumentRejected,
  whatsappDocumentVoided,
  whatsappReminderNotification,
} from "../lib/whatsapp";

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

async function isCcUser(docId: number, email: string): Promise<boolean> {
  const rows = await db
    .select({ id: documentCcTable.id })
    .from(documentCcTable)
    .innerJoin(usersTable, eq(documentCcTable.userId, usersTable.id))
    .where(and(eq(documentCcTable.documentId, docId), eq(usersTable.email, email)));
  return rows.length > 0;
}

async function canAccessDoc(docId: number, user: Express.User): Promise<boolean> {
  if (canSeeAllDocs(user.role)) return true;
  if (!user.id) return false;
  const [doc] = await db.select({ uploadedById: documentsTable.uploadedById }).from(documentsTable).where(eq(documentsTable.id, docId));
  if (!doc) return false;
  if (doc.uploadedById === user.id) return true;
  const signer = await db.select({ id: documentSignersTable.id }).from(documentSignersTable)
    .where(and(eq(documentSignersTable.documentId, docId), eq(documentSignersTable.email, user.email)));
  if (signer.length > 0) return true;
  return isCcUser(docId, user.email);
}

const geoCache = new Map<string, string>();
async function lookupGeo(ip: string | null | undefined): Promise<string> {
  if (!ip) return "—";
  const clean = ip.replace(/^::ffff:/, "");
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1$)/.test(clean)) return "Internal / Local";
  if (geoCache.has(clean)) return geoCache.get(clean)!;
  try {
    const res = await fetch(`http://ip-api.com/json/${clean}?fields=status,city,regionName,country`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json() as { status: string; city?: string; regionName?: string; country?: string };
    if (data.status === "success") {
      const loc = [data.city, data.regionName, data.country].filter(Boolean).join(", ");
      geoCache.set(clean, loc);
      return loc;
    }
  } catch {
    // geo lookup failed — degrade gracefully
  }
  return clean;
}

function getVerificationUrl(token: string): string {
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").filter(Boolean);
  const base = domains.length > 0 ? `https://${domains[0]}` : `http://localhost:${process.env.PORT ?? 80}`;
  return `${base}/verify/${token}`;
}

function addLinkAnnotation(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument["getPages"]>[number],
  x: number,
  y: number,
  w: number,
  h: number,
  url: string,
) {
  const annotation = pdfDoc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: pdfDoc.context.obj([x, y, x + w, y + h]),
    Border: pdfDoc.context.obj([0, 0, 0]),
    A: pdfDoc.context.obj({
      Type: PDFName.of("Action"),
      S: PDFName.of("URI"),
      URI: PDFString.of(url),
    }),
  });
  const annotRef = pdfDoc.context.register(annotation);
  const annotsKey = PDFName.of("Annots");
  const existingAnnots = page.node.lookup(annotsKey);
  if (existingAnnots instanceof PDFArray) {
    existingAnnots.push(annotRef);
  } else {
    page.node.set(annotsKey, pdfDoc.context.obj([annotRef]));
  }
}

// Keep local uploads dir only for legacy backward-compat reads
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Use memory storage — files go to GCS after receipt
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // hard ceiling; dynamic check done post-upload
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"));
    } else {
      cb(null, true);
    }
  },
});

async function getMaxUploadBytes(): Promise<number> {
  try {
    const rows = await db.select({ maxUploadSizeMb: privilegesTable.maxUploadSizeMb }).from(privilegesTable).limit(1);
    const mb = rows[0]?.maxUploadSizeMb ?? 10;
    return mb * 1024 * 1024;
  } catch {
    return 10 * 1024 * 1024;
  }
}

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
      conditions.push(eq(documentsTable.status, status as typeof documentsTable.status._.data));
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

    // Enforce dynamic upload size limit from privileges
    const maxBytes = await getMaxUploadBytes();
    if (req.file.size > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      res.status(413).json({
        error: "file_too_large",
        maxMb,
        fileSizeMb: +(req.file.size / (1024 * 1024)).toFixed(2),
      });
      return;
    }

    const { title, description } = req.body as { title?: string; description?: string };
    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    // Upload PDF buffer to persistent object storage
    const gcsPath = await uploadDocBuffer(req.file.buffer, "originals");

    const [doc] = await db.insert(documentsTable).values({
      title,
      description: description || null,
      fileName: req.file.originalname,
      filePath: gcsPath,
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
      userId: user.id,
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
    if (!await canAccessDoc(docId, user)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName}"`);

    if (isGcsPath(doc.filePath)) {
      // Try signed version first, fall back to original
      const signedPath = getSignedGcsPath(doc.filePath);
      const useSignedPath = await gcsFileExists(signedPath);
      const buf = await downloadDocBuffer(useSignedPath ? signedPath : doc.filePath);
      res.send(buf);
      return;
    }

    // Legacy: local disk
    const signedLocal = path.join(UPLOADS_DIR, `signed_${doc.filePath}`);
    const originalLocal = path.join(UPLOADS_DIR, doc.filePath);
    const localPath = fs.existsSync(signedLocal) ? signedLocal : originalLocal;
    if (!fs.existsSync(localPath)) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }
    fs.createReadStream(localPath).pipe(res);
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
    if (!await canAccessDoc(docId, user)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await logAudit(doc.id, user.id, user.name, user.email, req.ip, "downloaded", { mode });

    if (mode === "coc") {
      const cocPdf = await generateCOC(doc, docId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="COC_${doc.fileName}"`);
      res.send(Buffer.from(cocPdf));
      return;
    }

    // Resolve the best available PDF bytes (signed > original, GCS > local)
    let docBytes: Buffer;
    if (isGcsPath(doc.filePath!)) {
      const signedGcs = getSignedGcsPath(doc.filePath!);
      const hasSignedGcs = await gcsFileExists(signedGcs);
      docBytes = await downloadDocBuffer(hasSignedGcs ? signedGcs : doc.filePath!);
    } else {
      const signedLocal = path.join(UPLOADS_DIR, `signed_${doc.filePath}`);
      const originalLocal = path.join(UPLOADS_DIR, doc.filePath!);
      const localPath = fs.existsSync(signedLocal) ? signedLocal : originalLocal;
      if (!fs.existsSync(localPath)) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      docBytes = fs.readFileSync(localPath);
    }

    if (mode === "merged") {
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
    res.send(docBytes);
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
    if (!await canAccessDoc(docId, user)) {
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
      if (isGcsPath(existing.filePath)) {
        await deleteDocFromStorage(existing.filePath);
        await deleteDocFromStorage(getSignedGcsPath(existing.filePath));
      } else {
        const filePath = path.join(UPLOADS_DIR, existing.filePath);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        const signedPath = path.join(UPLOADS_DIR, `signed_${existing.filePath}`);
        if (fs.existsSync(signedPath)) fs.unlinkSync(signedPath);
      }
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
      userId: user.id,
    });

    // Notify first signer only (sequential) + uploader + CC (fire-and-forget)
    const ccEmails = await getCcEmails(docId);
    const firstSigner = [...signers].sort((a, b) => a.signerOrder - b.signerOrder)[0];
    const sentOpts = {
      docId,
      docTitle: doc.title,
      uploaderName: user.name,
      uploaderEmail: user.email,
      signers: firstSigner ? [{ name: firstSigner.name, email: firstSigner.email }] : [],
      ccEmails,
    };
    notifyDocumentSent(sentOpts).catch(() => {});
    telegramDocumentSent(sentOpts).catch(() => {});
    whatsappDocumentSent(sentOpts).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function generateSignedPDF(
  docId: number,
  filePath: string,
  sealOptions?: { verificationToken?: string | null; sealQrCode: boolean; sealInvisibleLink: boolean },
): Promise<string> {
  // Read original PDF from GCS or legacy local disk
  let pdfBytes: Buffer;
  if (isGcsPath(filePath)) {
    pdfBytes = await downloadDocBuffer(filePath);
  } else {
    pdfBytes = fs.readFileSync(path.join(UPLOADS_DIR, filePath));
  }

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

  // — Seal: Invisible Link Annotations over each filled signature field —
  if (sealOptions?.sealInvisibleLink && sealOptions.verificationToken) {
    const verificationUrl = getVerificationUrl(sealOptions.verificationToken);
    for (const field of filledFields) {
      const page = pages[field.page];
      if (!page) continue;
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const fieldX = (field.x / 100) * pageWidth;
      const fieldY = pageHeight - ((field.y / 100) * pageHeight) - ((field.height / 100) * pageHeight);
      const fieldW = (field.width / 100) * pageWidth;
      const fieldH = (field.height / 100) * pageHeight;
      addLinkAnnotation(pdfDoc, page, fieldX, fieldY, fieldW, fieldH, verificationUrl);
    }
  }

  // — Seal: QR Code on bottom-right corner of last page —
  if (sealOptions?.sealQrCode && sealOptions.verificationToken) {
    const verificationUrl = getVerificationUrl(sealOptions.verificationToken);
    const lastPage = pages[pages.length - 1];
    const { width: lw } = lastPage.getSize();
    try {
      const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
        type: "image/png",
        width: 150,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
      });
      const qrBuffer = Buffer.from(qrDataUrl.replace("data:image/png;base64,", ""), "base64");
      const qrImage = await pdfDoc.embedPng(qrBuffer);
      const qrSize = 70;
      const qrMargin = 15;
      const qrX = lw - qrSize - qrMargin;
      const qrLabelY = qrMargin;
      const qrImageY = qrMargin + 10;

      lastPage.drawRectangle({
        x: qrX - 5,
        y: qrLabelY - 3,
        width: qrSize + 10,
        height: qrSize + 18,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.78, 0.78, 0.78),
        borderWidth: 0.5,
      });
      lastPage.drawImage(qrImage, { x: qrX, y: qrImageY, width: qrSize, height: qrSize });
      const sealFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      lastPage.drawText("Verify Signature", {
        x: qrX,
        y: qrLabelY,
        size: 6,
        font: sealFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      addLinkAnnotation(pdfDoc, lastPage, qrX - 5, qrLabelY - 3, qrSize + 10, qrSize + 18, verificationUrl);
    } catch {
      // QR embedding failed — skip silently
    }
  }

  const signedBytes = Buffer.from(await pdfDoc.save());

  if (isGcsPath(filePath)) {
    const signedGcsPath = getSignedGcsPath(filePath);
    await uploadDocBufferAt(signedBytes, signedGcsPath.slice(4)); // strip "gcs:"
    return signedGcsPath;
  }

  // Legacy: write to local disk
  const signedFileName = `signed_${filePath}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, signedFileName), signedBytes);
  return signedFileName;
}

const EVENT_LABELS_PDF: Record<string, string> = {
  uploaded: "Uploaded",
  field_placed: "Field placed",
  signed: "Signed",
  field_filled: "Field filled",
  signer_completed: "Signer completed",
  document_completed: "Document completed",
  sent_for_signing: "Sent for signing",
  downloaded: "Downloaded",
  voided: "Voided",
  rejected: "Rejected",
};

async function generateCOC(doc: typeof documentsTable.$inferSelect, docId: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 50;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const BOTTOM_MARGIN = 70;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 50;

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 50;
    // Page header on continuation pages
    page.drawText("CHAIN OF CUSTODY — continued", { x: MARGIN, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 20;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    y -= 14;
  }

  function checkPage(needed = 14) {
    if (y < BOTTOM_MARGIN + needed) newPage();
  }

  function drawText(text: string, size: number, bold = false, color = rgb(0.1, 0.1, 0.1), x = MARGIN) {
    checkPage(size + 8);
    page.drawText(text.slice(0, 110), { x, y, size, font: bold ? boldFont : font, color });
    y -= size + 6;
  }

  function hRule(alpha = 0.8) {
    checkPage(10);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(alpha, alpha, alpha) });
    y -= 10;
  }

  // — Header —
  page.drawRectangle({ x: 0, y: PAGE_H - 85, width: PAGE_W, height: 85, color: rgb(0.07, 0.15, 0.45) });
  page.drawText("CERTIFICATE OF COMPLETION", { x: MARGIN, y: PAGE_H - 38, size: 18, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText("Chain of Custody  /  Audit Trail", { x: MARGIN, y: PAGE_H - 58, size: 10, font, color: rgb(0.75, 0.82, 1) });
  page.drawText("Tandatanganin — Digital Signature Platform", { x: MARGIN, y: PAGE_H - 74, size: 8, font, color: rgb(0.6, 0.68, 0.9) });
  y = PAGE_H - 105;

  // — Document details —
  drawText("DOCUMENT INFORMATION", 9, true, rgb(0.4, 0.4, 0.4));
  hRule(0.88);
  drawText(`Title:    ${doc.title}`, 10, false);
  drawText(`File:     ${doc.fileName}`, 10, false);
  drawText(`Status:   ${doc.status.toUpperCase().replace("_", " ")}`, 10, false);
  drawText(`Created:  ${doc.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC`, 10, false);
  y -= 8;

  // — Signers —
  const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId)).orderBy(documentSignersTable.signerOrder);
  if (signers.length > 0) {
    drawText("SIGNERS", 9, true, rgb(0.4, 0.4, 0.4));
    hRule(0.88);
    for (const s of signers) {
      const statusLabel = s.status === "completed" ? "[SIGNED]" : "[PENDING]";
      const completedLabel = s.completedAt
        ? `  (completed ${s.completedAt.toISOString().replace("T", " ").slice(0, 19)} UTC)`
        : "";
      drawText(`${s.signerOrder + 1}.  ${s.name}  <${s.email}>  —  ${statusLabel}${completedLabel}`, 9, false);
    }
    y -= 8;
  }

  // — Audit Trail —
  const auditLogs = await db.select().from(documentAuditTable)
    .where(eq(documentAuditTable.documentId, docId))
    .orderBy(documentAuditTable.createdAt);

  // Deduplicate IPs and fetch geo in parallel
  const uniqueIps = [...new Set(auditLogs.map((l) => l.actorIp).filter(Boolean))];
  await Promise.all(uniqueIps.map((ip) => lookupGeo(ip)));

  checkPage(40);
  drawText("AUDIT TRAIL", 9, true, rgb(0.4, 0.4, 0.4));
  hRule(0.88);

  // Column headers
  const COL_DATE = MARGIN;
  const COL_TIME = MARGIN + 62;
  const COL_EVENT = MARGIN + 118;
  const COL_NAME = MARGIN + 210;
  const COL_EMAIL = MARGIN + 290;
  const COL_GEO = MARGIN + 390;

  checkPage(18);
  const headerY = y;
  page.drawRectangle({ x: MARGIN - 2, y: headerY - 2, width: CONTENT_W + 4, height: 14, color: rgb(0.93, 0.95, 0.98) });
  const colHeaders: [string, number][] = [
    ["DATE", COL_DATE], ["TIME (UTC)", COL_TIME], ["EVENT", COL_EVENT],
    ["NAME", COL_NAME], ["EMAIL", COL_EMAIL], ["LOCATION", COL_GEO],
  ];
  for (const [label, x] of colHeaders) {
    page.drawText(label, { x, y: headerY, size: 7, font: boldFont, color: rgb(0.3, 0.3, 0.5) });
  }
  y -= 16;

  // Rows
  for (let i = 0; i < auditLogs.length; i++) {
    const log = auditLogs[i];
    checkPage(14);
    const rowY = y;

    if (i % 2 === 0) {
      page.drawRectangle({ x: MARGIN - 2, y: rowY - 3, width: CONTENT_W + 4, height: 13, color: rgb(0.97, 0.97, 0.99) });
    }

    const dt = log.createdAt;
    const dateStr = dt.toISOString().slice(0, 10);
    const timeStr = dt.toISOString().slice(11, 19);
    const eventStr = (EVENT_LABELS_PDF[log.eventType] ?? log.eventType).slice(0, 18);
    const nameStr = (log.actorName ?? "").slice(0, 18);
    const emailStr = (log.actorEmail ?? "").slice(0, 24);
    const geoStr = (await lookupGeo(log.actorIp)).slice(0, 28);

    const rowData: [string, number][] = [
      [dateStr, COL_DATE], [timeStr, COL_TIME], [eventStr, COL_EVENT],
      [nameStr, COL_NAME], [emailStr, COL_EMAIL], [geoStr, COL_GEO],
    ];
    for (const [text, x] of rowData) {
      page.drawText(text, { x, y: rowY, size: 7.5, font, color: rgb(0.15, 0.15, 0.15) });
    }
    y -= 13;
  }

  // — Footer —
  y -= 16;
  hRule(0.82);
  drawText(`Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC   ·   Total events: ${auditLogs.length}`, 7.5, false, rgb(0.5, 0.5, 0.5));
  drawText("This certificate was automatically generated by Tandatanganin — Digital Signature Platform", 7.5, false, rgb(0.5, 0.5, 0.5));

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

    // Cannot void what's already voided, rejected, or completed
    if (["voided", "rejected", "completed", "signed"].includes(doc.status)) {
      res.status(400).json({ error: "This document cannot be voided in its current state" }); return;
    }

    await db.update(documentsTable).set({ status: "voided", updatedAt: new Date() }).where(eq(documentsTable.id, docId));
    await logAudit(docId, user.id, user.name, user.email, req.ip, "voided", { reason });

    // Notify
    const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId));
    const ccEmails = await getCcEmails(docId);
    const uploaderEmail = await getUploaderEmail(doc.uploadedById);

    const voidedOpts = {
      docId,
      docTitle: doc.title,
      voidedByName: user.name,
      reason,
      uploaderEmail: uploaderEmail ?? user.email,
      allSignerEmails: signers.map((s) => s.email),
      ccEmails,
    };
    notifyDocumentVoided(voidedOpts).catch(() => {});
    telegramDocumentVoided(voidedOpts).catch(() => {});
    whatsappDocumentVoided(voidedOpts).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/remind", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const user = req.user!;

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    const isOwner = doc.uploadedById === user.id;
    const isAdmin = user.role === "admin" || user.role === "superadmin";
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: "Only the document owner or an admin can send reminders" }); return;
    }
    if (!["pending", "in_progress"].includes(doc.status)) {
      res.status(400).json({ error: "Document is not pending any signatures" }); return;
    }

    const pendingSigners = await db
      .select()
      .from(documentSignersTable)
      .where(and(eq(documentSignersTable.documentId, docId), eq(documentSignersTable.status, "pending")));

    if (pendingSigners.length === 0) {
      res.status(400).json({ error: "No pending signers found" }); return;
    }

    const uploaderInfo = doc.uploadedById
      ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, doc.uploadedById)))[0]
      : null;
    const uploaderName = uploaderInfo?.name ?? user.name;

    // Fire notifications to each pending signer (non-blocking)
    for (const signer of pendingSigners) {
      sendReminderEmail({
        signerName: signer.name,
        signerEmail: signer.email,
        docId,
        docTitle: doc.title,
        uploaderName,
      }).catch(() => {});
      telegramReminderNotification({
        signerEmail: signer.email,
        signerName: signer.name,
        docId,
        docTitle: doc.title,
        uploaderName,
      }).catch(() => {});
      whatsappReminderNotification({
        signerEmail: signer.email,
        signerName: signer.name,
        docId,
        docTitle: doc.title,
        uploaderName,
      }).catch(() => {});
      // Reset per-signer reminderSentAt so scheduler can re-trigger later
      await db.update(documentSignersTable)
        .set({ reminderSentAt: null })
        .where(eq(documentSignersTable.id, signer.id));
    }

    // Reset document-level ownerReminderSentAt so scheduler can re-trigger later
    await db.update(documentsTable)
      .set({ ownerReminderSentAt: null })
      .where(eq(documentsTable.id, docId));

    req.log.info({ docId, pendingCount: pendingSigners.length }, "Manual reminder sent by owner");
    res.json({ ok: true, reminded: pendingSigners.length });
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
    // Mark the rejecting signer's individual status as "rejected"
    if (signer) {
      await db.update(documentSignersTable)
        .set({ status: "rejected" })
        .where(eq(documentSignersTable.id, signer.id));
    }
    await logAudit(docId, user.id, user.name, user.email, req.ip, "rejected", { reason });

    // Notify
    const signers = await db.select().from(documentSignersTable).where(eq(documentSignersTable.documentId, docId));
    const ccEmails = await getCcEmails(docId);
    const uploaderEmail = await getUploaderEmail(doc.uploadedById);

    const rejectedOpts = {
      docId,
      docTitle: doc.title,
      rejectedByName: user.name,
      rejectedByEmail: user.email,
      reason,
      uploaderEmail: uploaderEmail ?? "",
      otherSignerEmails: signers.filter((s) => s.email !== user.email).map((s) => s.email),
      ccEmails,
    };
    notifyDocumentRejected(rejectedOpts).catch(() => {});
    telegramDocumentRejected(rejectedOpts).catch(() => {});
    whatsappDocumentRejected(rejectedOpts).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.verificationToken, token));
    if (!doc) {
      res.status(404).json({ error: "Document not found or verification token invalid" });
      return;
    }
    const signers = await db
      .select()
      .from(documentSignersTable)
      .where(eq(documentSignersTable.documentId, doc.id))
      .orderBy(documentSignersTable.signerOrder);

    res.json({
      id: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      status: doc.status,
      signedAt: doc.signedAt?.toISOString() ?? null,
      createdAt: doc.createdAt.toISOString(),
      isAuthentic: doc.status === "completed",
      verificationToken: token,
      signers: signers.map((s) => ({
        name: s.name,
        email: s.email,
        status: s.status,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/documents/:id/seal", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const user = req.user!;
    const { sealQrCode, sealInvisibleLink } = req.body as { sealQrCode?: boolean; sealInvisibleLink?: boolean };

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    const isOwner = doc.uploadedById === user.id;
    const isAdmin = user.role === "admin" || user.role === "superadmin";
    if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

    const token = doc.verificationToken ?? randomUUID();
    const updates: Record<string, unknown> = { verificationToken: token, updatedAt: new Date() };
    if (typeof sealQrCode === "boolean") updates.sealQrCode = sealQrCode;
    if (typeof sealInvisibleLink === "boolean") updates.sealInvisibleLink = sealInvisibleLink;

    await db.update(documentsTable).set(updates as Parameters<typeof db.update>[0] extends any ? any : never).where(eq(documentsTable.id, docId));
    const [updated] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));

    res.json({
      ok: true,
      verificationToken: updated.verificationToken,
      sealQrCode: updated.sealQrCode,
      sealInvisibleLink: updated.sealInvisibleLink,
    });
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
      userId: user.id,
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
    verificationToken: doc.verificationToken ?? null,
    sealQrCode: doc.sealQrCode,
    sealInvisibleLink: doc.sealInvisibleLink,
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
