import { db } from "@workspace/db";
import { usersTable, privilegesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

if (!FONNTE_TOKEN) {
  logger.warn("FONNTE_TOKEN not set — WhatsApp notifications will be skipped");
}

function appUrl(): string {
  return process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "https://tandatanganin.replit.app";
}

function docUrl(docId: number): string {
  return `${appUrl()}/documents/${docId}`;
}

async function getSettings(): Promise<{ enabled: boolean; ratePerSecond: number }> {
  try {
    const rows = await db
      .select({
        whatsappEnabled: privilegesTable.whatsappEnabled,
        whatsappRatePerSecond: privilegesTable.whatsappRatePerSecond,
      })
      .from(privilegesTable)
      .limit(1);
    if (rows.length === 0) return { enabled: false, ratePerSecond: 1 };
    return {
      enabled: rows[0].whatsappEnabled ?? false,
      ratePerSecond: rows[0].whatsappRatePerSecond ?? 1,
    };
  } catch {
    return { enabled: false, ratePerSecond: 1 };
  }
}

async function getPhoneByEmail(email: string): Promise<string | null> {
  try {
    const [user] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    return user?.phone?.trim() || null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendRaw(phone: string, text: string): Promise<void> {
  if (!FONNTE_TOKEN) return;
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: FONNTE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target: phone, message: text }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ phone, status: res.status, body }, "📱 WhatsApp message failed");
    } else {
      logger.info({ phone }, "📱 WhatsApp message sent");
    }
  } catch (err) {
    logger.error({ err, phone }, "📱 WhatsApp send error");
  }
}

async function sendBatch(
  targets: { email: string; text: string }[],
  ratePerSecond: number,
): Promise<void> {
  if (!FONNTE_TOKEN) return;
  const delayMs = Math.max(100, Math.round(1000 / ratePerSecond));
  let first = true;
  for (const { email, text } of targets) {
    const phone = await getPhoneByEmail(email);
    if (!phone) continue;
    if (!first) await sleep(delayMs);
    first = false;
    await sendRaw(phone, text);
  }
}

// ─── Notification helpers ────────────────────────────────────────────────────

export async function whatsappDocumentSent(opts: {
  docId: number;
  docTitle: string;
  uploaderName: string;
  uploaderEmail: string;
  signers: { name: string; email: string }[];
  ccEmails: string[];
}): Promise<void> {
  const { enabled, ratePerSecond } = await getSettings();
  if (!enabled) return;

  const { docId, docTitle, uploaderName, uploaderEmail, signers, ccEmails } = opts;
  const link = docUrl(docId);

  const targets: { email: string; text: string }[] = [];

  for (const signer of signers) {
    targets.push({
      email: signer.email,
      text: [
        `✍️ *Action Required: Sign Document*`,
        ``,
        `You have been requested to sign:`,
        `📄 *${docTitle}*`,
        `👤 Requested by: ${uploaderName}`,
        ``,
        `👉 Open & Sign: ${link}`,
      ].join("\n"),
    });
  }

  targets.push({
    email: uploaderEmail,
    text: [
      `📤 *Document Sent for Signing*`,
      ``,
      `📄 *${docTitle}*`,
      `👥 Signers: ${signers.map((s) => s.name).join(", ")}`,
      ``,
      `👉 View Document: ${link}`,
    ].join("\n"),
  });

  for (const email of ccEmails) {
    targets.push({
      email,
      text: [
        `👁️ *You've Been CC'd on a Document*`,
        ``,
        `📄 *${docTitle}*`,
        `👤 Requested by: ${uploaderName}`,
        ``,
        `👉 View Document: ${link}`,
      ].join("\n"),
    });
  }

  await sendBatch(targets, ratePerSecond);
}

export async function whatsappSignerCompleted(opts: {
  docId: number;
  docTitle: string;
  signerName: string;
  uploaderEmail: string;
  nextSigner?: { name: string; email: string };
  ccEmails: string[];
}): Promise<void> {
  const { enabled, ratePerSecond } = await getSettings();
  if (!enabled) return;

  const { docId, docTitle, signerName, uploaderEmail, nextSigner, ccEmails } = opts;
  const link = docUrl(docId);

  const targets: { email: string; text: string }[] = [];

  targets.push({
    email: uploaderEmail,
    text: [
      `✅ *Signing Progress Update*`,
      ``,
      `📄 *${docTitle}*`,
      `✍️ ${signerName} has completed their signature fields.`,
      nextSigner ? `⏭️ Next signer: ${nextSigner.name}` : "",
      ``,
      `👉 View Document: ${link}`,
    ].filter(Boolean).join("\n"),
  });

  if (nextSigner) {
    targets.push({
      email: nextSigner.email,
      text: [
        `✍️ *Action Required: It's Your Turn to Sign*`,
        ``,
        `📄 *${docTitle}*`,
        `👆 ${signerName} has already signed. You're next.`,
        ``,
        `👉 Open & Sign: ${link}`,
      ].join("\n"),
    });
  }

  for (const email of ccEmails) {
    targets.push({
      email,
      text: [
        `📊 *Signing Progress Update*`,
        ``,
        `📄 *${docTitle}*`,
        `✍️ ${signerName} has completed their signature fields.`,
        ``,
        `👉 View Document: ${link}`,
      ].join("\n"),
    });
  }

  await sendBatch(targets, ratePerSecond);
}

export async function whatsappDocumentCompleted(opts: {
  docId: number;
  docTitle: string;
  uploaderEmail: string;
  allSignerEmails: string[];
  ccEmails: string[];
}): Promise<void> {
  const { enabled, ratePerSecond } = await getSettings();
  if (!enabled) return;

  const { docId, docTitle, uploaderEmail, allSignerEmails, ccEmails } = opts;
  const link = docUrl(docId);
  const text = [
    `🎉 *Document Fully Signed*`,
    ``,
    `📄 *${docTitle}*`,
    `✅ All signers have completed their fields. The signed document is now available.`,
    ``,
    `👉 Download Signed Document: ${link}`,
  ].join("\n");

  const allEmails = [...new Set([uploaderEmail, ...allSignerEmails, ...ccEmails])];
  await sendBatch(allEmails.map((email) => ({ email, text })), ratePerSecond);
}

export async function whatsappDocumentRejected(opts: {
  docId: number;
  docTitle: string;
  rejectedByName: string;
  reason?: string;
  uploaderEmail: string;
  otherSignerEmails: string[];
  ccEmails: string[];
}): Promise<void> {
  const { enabled, ratePerSecond } = await getSettings();
  if (!enabled) return;

  const { docId, docTitle, rejectedByName, reason, uploaderEmail, otherSignerEmails, ccEmails } = opts;
  const link = docUrl(docId);
  const text = [
    `❌ *Document Rejected*`,
    ``,
    `📄 *${docTitle}*`,
    `👤 Rejected by: ${rejectedByName}`,
    reason ? `💬 Reason: ${reason}` : "",
    ``,
    `👉 View Document: ${link}`,
  ].filter(Boolean).join("\n");

  const allEmails = [...new Set([uploaderEmail, ...otherSignerEmails, ...ccEmails])];
  await sendBatch(allEmails.map((email) => ({ email, text })), ratePerSecond);
}

export async function whatsappDocumentVoided(opts: {
  docId: number;
  docTitle: string;
  voidedByName: string;
  reason?: string;
  uploaderEmail: string;
  allSignerEmails: string[];
  ccEmails: string[];
}): Promise<void> {
  const { enabled, ratePerSecond } = await getSettings();
  if (!enabled) return;

  const { docId, docTitle, voidedByName, reason, uploaderEmail, allSignerEmails, ccEmails } = opts;
  const link = docUrl(docId);
  const text = [
    `🚫 *Document Voided*`,
    ``,
    `📄 *${docTitle}*`,
    `👤 Voided by: ${voidedByName}`,
    reason ? `💬 Reason: ${reason}` : "",
    ``,
    `👉 View Document: ${link}`,
  ].filter(Boolean).join("\n");

  const allEmails = [...new Set([uploaderEmail, ...allSignerEmails, ...ccEmails])];
  await sendBatch(allEmails.map((email) => ({ email, text })), ratePerSecond);
}

export async function whatsappReminderNotification(opts: {
  signerEmail: string;
  signerName: string;
  docId: number;
  docTitle: string;
  uploaderName: string;
}): Promise<void> {
  const { enabled, ratePerSecond } = await getSettings();
  if (!enabled) return;

  const { signerEmail, signerName, docId, docTitle, uploaderName } = opts;
  const link = docUrl(docId);
  await sendBatch([{
    email: signerEmail,
    text: [
      `⏰ *Reminder: Pending Signature*`,
      ``,
      `Hi ${signerName}, your signature is still pending.`,
      `📄 *${docTitle}*`,
      `👤 Requested by: ${uploaderName}`,
      ``,
      `👉 Open & Sign: ${link}`,
    ].join("\n"),
  }], ratePerSecond);
}

export async function whatsappOwnerPendingReminder(opts: {
  ownerEmail: string;
  ownerName: string;
  docId: number;
  docTitle: string;
  pendingSigners: { name: string; email: string }[];
}): Promise<void> {
  const { enabled, ratePerSecond } = await getSettings();
  if (!enabled) return;

  const { ownerEmail, ownerName, docId, docTitle, pendingSigners } = opts;
  const link = docUrl(docId);
  const signerList = pendingSigners.map((s) => `  • ${s.name}`).join("\n");
  await sendBatch([{
    email: ownerEmail,
    text: [
      `📋 *Reminder: Document Awaiting Signatures*`,
      ``,
      `Hi ${ownerName}, your document is still pending.`,
      `📄 *${docTitle}*`,
      ``,
      `⏳ Pending signer${pendingSigners.length > 1 ? "s" : ""}:`,
      signerList,
      ``,
      `👉 View Document: ${link}`,
    ].join("\n"),
  }], ratePerSecond);
}
