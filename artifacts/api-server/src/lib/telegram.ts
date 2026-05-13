import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram notifications will be skipped");
}

function appUrl(): string {
  return process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "https://tandatanganin.replit.app";
}

function docUrl(docId: number): string {
  return `${appUrl()}/documents/${docId}`;
}

async function sendMessage(chatId: string, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ chatId, status: res.status, body }, "📨 Telegram message failed");
    } else {
      logger.info({ chatId }, "📨 Telegram message sent");
    }
  } catch (err) {
    logger.error({ err, chatId }, "📨 Telegram send error");
  }
}

async function getChatIdByEmail(email: string): Promise<string | null> {
  try {
    const [user] = await db
      .select({ telegramChatId: usersTable.telegramChatId })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    return user?.telegramChatId ?? null;
  } catch {
    return null;
  }
}

async function sendToEmail(email: string, text: string): Promise<void> {
  const chatId = await getChatIdByEmail(email);
  if (chatId) await sendMessage(chatId, text);
}

async function sendToEmails(emails: string[], text: string): Promise<void> {
  await Promise.all(emails.map((e) => sendToEmail(e, text)));
}

// ─── Notification helpers ────────────────────────────────────────────────────

export async function telegramDocumentSent(opts: {
  docId: number;
  docTitle: string;
  uploaderName: string;
  uploaderEmail: string;
  signers: { name: string; email: string }[];
  ccEmails: string[];
}): Promise<void> {
  const { docId, docTitle, uploaderName, uploaderEmail, signers, ccEmails } = opts;
  const link = docUrl(docId);

  for (const signer of signers) {
    await sendToEmail(signer.email, [
      `✍️ <b>Action Required: Sign Document</b>`,
      ``,
      `You have been requested to sign:`,
      `📄 <b>${docTitle}</b>`,
      `👤 Requested by: ${uploaderName}`,
      ``,
      `<a href="${link}">👉 Open &amp; Sign Document</a>`,
    ].join("\n"));
  }

  await sendToEmail(uploaderEmail, [
    `📤 <b>Document Sent for Signing</b>`,
    ``,
    `📄 <b>${docTitle}</b>`,
    `👥 Signers: ${signers.map((s) => s.name).join(", ")}`,
    ``,
    `<a href="${link}">👉 View Document</a>`,
  ].join("\n"));

  if (ccEmails.length > 0) {
    await sendToEmails(ccEmails, [
      `👁️ <b>You've Been CC'd on a Document</b>`,
      ``,
      `📄 <b>${docTitle}</b>`,
      `👤 Requested by: ${uploaderName}`,
      ``,
      `<a href="${link}">👉 View Document</a>`,
    ].join("\n"));
  }
}

export async function telegramSignerCompleted(opts: {
  docId: number;
  docTitle: string;
  signerName: string;
  uploaderName: string;
  uploaderEmail: string;
  nextSigner?: { name: string; email: string };
  ccEmails: string[];
}): Promise<void> {
  const { docId, docTitle, signerName, uploaderName, uploaderEmail, nextSigner, ccEmails } = opts;
  const link = docUrl(docId);

  await sendToEmail(uploaderEmail, [
    `✅ <b>Signing Progress Update</b>`,
    ``,
    `📄 <b>${docTitle}</b>`,
    `✍️ ${signerName} has completed their signature fields.`,
    nextSigner ? `⏭️ Next signer: ${nextSigner.name}` : "",
    ``,
    `<a href="${link}">👉 View Document</a>`,
  ].filter(Boolean).join("\n"));

  if (nextSigner) {
    await sendToEmail(nextSigner.email, [
      `✍️ <b>Action Required: It's Your Turn to Sign</b>`,
      ``,
      `📄 <b>${docTitle}</b>`,
      `👤 Requested by: ${uploaderName}`,
      `👆 ${signerName} has already signed. You're next.`,
      ``,
      `<a href="${link}">👉 Open &amp; Sign Document</a>`,
    ].join("\n"));
  }

  if (ccEmails.length > 0) {
    await sendToEmails(ccEmails, [
      `📊 <b>Signing Progress Update</b>`,
      ``,
      `📄 <b>${docTitle}</b>`,
      `✍️ ${signerName} has completed their signature fields.`,
      ``,
      `<a href="${link}">👉 View Document</a>`,
    ].join("\n"));
  }
}

export async function telegramDocumentCompleted(opts: {
  docId: number;
  docTitle: string;
  uploaderEmail: string;
  allSignerEmails: string[];
  ccEmails: string[];
}): Promise<void> {
  const { docId, docTitle, uploaderEmail, allSignerEmails, ccEmails } = opts;
  const link = docUrl(docId);
  const msg = [
    `🎉 <b>Document Fully Signed</b>`,
    ``,
    `📄 <b>${docTitle}</b>`,
    `✅ All signers have completed their fields. The signed document is now available.`,
    ``,
    `<a href="${link}">👉 Download Signed Document</a>`,
  ].join("\n");

  const all = [...new Set([uploaderEmail, ...allSignerEmails, ...ccEmails])];
  await sendToEmails(all, msg);
}

export async function telegramDocumentRejected(opts: {
  docId: number;
  docTitle: string;
  rejectedByName: string;
  reason?: string;
  uploaderEmail: string;
  otherSignerEmails: string[];
  ccEmails: string[];
}): Promise<void> {
  const { docId, docTitle, rejectedByName, reason, uploaderEmail, otherSignerEmails, ccEmails } = opts;
  const link = docUrl(docId);
  const msg = [
    `❌ <b>Document Rejected</b>`,
    ``,
    `📄 <b>${docTitle}</b>`,
    `👤 Rejected by: ${rejectedByName}`,
    reason ? `💬 Reason: ${reason}` : "",
    ``,
    `<a href="${link}">👉 View Document</a>`,
  ].filter(Boolean).join("\n");

  const all = [...new Set([uploaderEmail, ...otherSignerEmails, ...ccEmails])];
  await sendToEmails(all, msg);
}

export async function telegramOwnerPendingReminder(opts: {
  ownerEmail: string;
  ownerName: string;
  docId: number;
  docTitle: string;
  pendingSigners: { name: string; email: string }[];
}): Promise<void> {
  const { ownerEmail, ownerName, docId, docTitle, pendingSigners } = opts;
  const link = docUrl(docId);
  const signerList = pendingSigners.map((s) => `  • ${s.name}`).join("\n");
  await sendToEmail(ownerEmail, [
    `📋 <b>Reminder: Document Awaiting Signatures</b>`,
    ``,
    `Hi ${ownerName}, your document is still pending.`,
    `📄 <b>${docTitle}</b>`,
    ``,
    `⏳ Pending signer${pendingSigners.length > 1 ? "s" : ""}:`,
    signerList,
    ``,
    `<a href="${link}">👉 View Document</a>`,
  ].join("\n"));
}

export async function telegramReminderNotification(opts: {
  signerEmail: string;
  signerName: string;
  docId: number;
  docTitle: string;
  uploaderName: string;
}): Promise<void> {
  const { signerEmail, signerName, docId, docTitle, uploaderName } = opts;
  const link = docUrl(docId);
  await sendToEmail(signerEmail, [
    `⏰ <b>Reminder: Pending Signature</b>`,
    ``,
    `Hi ${signerName}, your signature is still pending.`,
    `📄 <b>${docTitle}</b>`,
    `👤 Requested by: ${uploaderName}`,
    ``,
    `<a href="${link}">👉 Open &amp; Sign Document</a>`,
  ].join("\n"));
}

export async function telegramDocumentVoided(opts: {
  docId: number;
  docTitle: string;
  voidedByName: string;
  reason?: string;
  uploaderEmail: string;
  allSignerEmails: string[];
  ccEmails: string[];
}): Promise<void> {
  const { docId, docTitle, voidedByName, reason, uploaderEmail, allSignerEmails, ccEmails } = opts;
  const link = docUrl(docId);
  const msg = [
    `🚫 <b>Document Voided</b>`,
    ``,
    `📄 <b>${docTitle}</b>`,
    `👤 Voided by: ${voidedByName}`,
    reason ? `💬 Reason: ${reason}` : "",
    ``,
    `<a href="${link}">👉 View Document</a>`,
  ].filter(Boolean).join("\n");

  const all = [...new Set([uploaderEmail, ...allSignerEmails, ...ccEmails])];
  await sendToEmails(all, msg);
}
