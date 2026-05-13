import nodemailer from "nodemailer";
import { logger } from "./logger";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;

const configured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM);

const transporter = configured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: Number(SMTP_PORT ?? 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

if (!configured) {
  logger.warn("SMTP not configured — email notifications will be logged only");
}

export type EmailCategory = "Info" | "Action" | "Reject" | "Complete" | "Void";

function subjectLine(category: EmailCategory, title: string): string {
  return `[${category}] Tandatanganin — ${title}`;
}

function baseLayout(category: EmailCategory, bodyHtml: string): string {
  const categoryColor: Record<EmailCategory, string> = {
    Info: "#2563eb",
    Action: "#d97706",
    Reject: "#dc2626",
    Complete: "#16a34a",
    Void: "#6b7280",
  };
  const color = categoryColor[category];
  const appUrl = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "https://tandatanganin.replit.app";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f3f4f6">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <!-- Header -->
        <tr><td style="background:${color};padding:24px 32px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="font-size:22px;font-weight:700;color:#fff">Tandatanganin</span></td>
              <td align="right"><span style="background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em">${category}</span></td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">${bodyHtml}</td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
            Tandatanganin — Digital Signature Platform<br>
            <a href="${appUrl}" style="color:#6b7280;text-decoration:none">${appUrl}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text: string, href: string, color = "#2563eb"): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:${color};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">${text}</a>`;
}

function docLink(docId: number): string {
  const base = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "https://tandatanganin.replit.app";
  return `${base}/documents/${docId}`;
}

async function send(to: string | string[], subject: string, html: string) {
  const recipients = Array.isArray(to) ? to.join(", ") : to;
  if (!transporter || !configured) {
    logger.info({ to: recipients, subject }, "📧 [EMAIL-DRY-RUN]");
    return;
  }
  try {
    await transporter.sendMail({ from: SMTP_FROM, to: recipients, subject, html });
    logger.info({ to: recipients, subject }, "📧 Email sent");
  } catch (err) {
    logger.error({ err, to: recipients, subject }, "📧 Email send failed");
  }
}

// ─── Notification helpers ────────────────────────────────────────────────────

export async function notifyDocumentSent(opts: {
  docId: number;
  docTitle: string;
  uploaderName: string;
  uploaderEmail: string;
  signers: { name: string; email: string }[];
  ccEmails: string[];
}) {
  const { docId, docTitle, uploaderName, uploaderEmail, signers, ccEmails } = opts;
  const link = docLink(docId);

  // ACTION → first signer (or all if parallel)
  for (const signer of signers) {
    const html = baseLayout("Action", `
      <h2 style="margin:0 0 8px;font-size:20px;color:#111">Action Required: Sign Document</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:14px">You have been requested to sign a document.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:8px">
        <tr><td style="font-size:13px;color:#374151"><strong>Document:</strong> ${docTitle}</td></tr>
        <tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Requested by:</strong> ${uploaderName}</td></tr>
      </table>
      <p style="font-size:13px;color:#6b7280">Please open the document and complete your signature fields.</p>
      ${btn("Open & Sign Document", link, "#d97706")}
    `);
    await send(signer.email, subjectLine("Action", docTitle), html);
  }

  // INFO → uploader confirmation
  const uploaderHtml = baseLayout("Info", `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111">Document Sent for Signing</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px">Your document has been sent to the following signers.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:8px">
      <tr><td style="font-size:13px;color:#374151"><strong>Document:</strong> ${docTitle}</td></tr>
      <tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Signers:</strong> ${signers.map((s) => `${s.name} &lt;${s.email}&gt;`).join(", ")}</td></tr>
    </table>
    ${btn("View Document", link, "#2563eb")}
  `);
  await send(uploaderEmail, subjectLine("Info", docTitle), uploaderHtml);

  // INFO → CC recipients
  if (ccEmails.length > 0) {
    const ccHtml = baseLayout("Info", `
      <h2 style="margin:0 0 8px;font-size:20px;color:#111">You've Been CC'd on a Document</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:14px">You are listed as an observer on this signing request.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:8px">
        <tr><td style="font-size:13px;color:#374151"><strong>Document:</strong> ${docTitle}</td></tr>
        <tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Requested by:</strong> ${uploaderName}</td></tr>
      </table>
      <p style="font-size:13px;color:#6b7280">You will receive notifications when the document is completed, rejected, or voided.</p>
      ${btn("View Document", link, "#2563eb")}
    `);
    for (const email of ccEmails) {
      await send(email, subjectLine("Info", docTitle), ccHtml);
    }
  }
}

export async function notifySignerCompleted(opts: {
  docId: number;
  docTitle: string;
  signerName: string;
  uploaderName: string;
  uploaderEmail: string;
  nextSigner?: { name: string; email: string };
  ccEmails: string[];
}) {
  const { docId, docTitle, signerName, uploaderName, uploaderEmail, nextSigner, ccEmails } = opts;
  const link = docLink(docId);

  // INFO → uploader: someone signed
  const uploaderHtml = baseLayout("Info", `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111">A Signer Has Completed Their Fields</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px"><strong>${signerName}</strong> has completed their signature fields.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:8px">
      <tr><td style="font-size:13px;color:#374151"><strong>Document:</strong> ${docTitle}</td></tr>
      <tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Signed by:</strong> ${signerName}</td></tr>
      ${nextSigner ? `<tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Next signer:</strong> ${nextSigner.name} &lt;${nextSigner.email}&gt;</td></tr>` : ""}
    </table>
    ${btn("View Document", link, "#2563eb")}
  `);
  await send(uploaderEmail, subjectLine("Info", docTitle), uploaderHtml);

  // ACTION → next signer
  if (nextSigner) {
    const nextHtml = baseLayout("Action", `
      <h2 style="margin:0 0 8px;font-size:20px;color:#111">Action Required: It's Your Turn to Sign</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:14px">A previous signer has completed their fields. It is now your turn.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:8px">
        <tr><td style="font-size:13px;color:#374151"><strong>Document:</strong> ${docTitle}</td></tr>
        <tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Requested by:</strong> ${uploaderName}</td></tr>
        <tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Previously signed by:</strong> ${signerName}</td></tr>
      </table>
      ${btn("Open & Sign Document", link, "#d97706")}
    `);
    await send(nextSigner.email, subjectLine("Action", docTitle), nextHtml);
  }

  // INFO → CC recipients
  for (const email of ccEmails) {
    const ccHtml = baseLayout("Info", `
      <h2 style="margin:0 0 8px;font-size:20px;color:#111">Signing Progress Update</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:14px"><strong>${signerName}</strong> has completed their signature fields on a document you're observing.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:16px">
        <tr><td style="font-size:13px;color:#374151"><strong>Document:</strong> ${docTitle}</td></tr>
      </table>
      ${btn("View Document", link, "#2563eb")}
    `);
    await send(email, subjectLine("Info", docTitle), ccHtml);
  }
}

export async function notifyDocumentCompleted(opts: {
  docId: number;
  docTitle: string;
  uploaderEmail: string;
  allSignerEmails: string[];
  ccEmails: string[];
}) {
  const { docId, docTitle, uploaderEmail, allSignerEmails, ccEmails } = opts;
  const link = docLink(docId);

  const completedHtml = (recipientType: string) => baseLayout("Complete", `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111">Document Fully Signed</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px">All signers have completed their fields. The signed document and Certificate of Completion are now available.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:8px">
      <tr><td style="font-size:13px;color:#166534"><strong>Document:</strong> ${docTitle}</td></tr>
      <tr><td style="font-size:13px;color:#166534;padding-top:6px">✅ Signing process is complete</td></tr>
    </table>
    <p style="font-size:13px;color:#6b7280">You can now download the signed PDF and the Certificate of Completion.</p>
    ${btn("Download Signed Document", link, "#16a34a")}
  `);

  const allRecipients = [...new Set([uploaderEmail, ...allSignerEmails, ...ccEmails])];
  for (const email of allRecipients) {
    await send(email, subjectLine("Complete", docTitle), completedHtml(email));
  }
}

export async function notifyDocumentRejected(opts: {
  docId: number;
  docTitle: string;
  rejectedByName: string;
  rejectedByEmail: string;
  reason?: string;
  uploaderEmail: string;
  otherSignerEmails: string[];
  ccEmails: string[];
}) {
  const { docId, docTitle, rejectedByName, reason, uploaderEmail, otherSignerEmails, ccEmails } = opts;
  const link = docLink(docId);

  const rejectHtml = baseLayout("Reject", `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111">Document Rejected</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px"><strong>${rejectedByName}</strong> has rejected this document.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:${reason ? "12px" : "8px"}">
      <tr><td style="font-size:13px;color:#991b1b"><strong>Document:</strong> ${docTitle}</td></tr>
      <tr><td style="font-size:13px;color:#991b1b;padding-top:6px"><strong>Rejected by:</strong> ${rejectedByName}</td></tr>
    </table>
    ${reason ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #ea580c;border-radius:8px;padding:16px;margin-bottom:8px">
      <tr><td style="font-size:12px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;padding-bottom:6px">Rejection Reason</td></tr>
      <tr><td style="font-size:14px;color:#7c2d12;line-height:1.6">${reason}</td></tr>
    </table>` : ""}
    ${btn("View Document", link, "#dc2626")}
  `);

  const allRecipients = [...new Set([uploaderEmail, ...otherSignerEmails, ...ccEmails])];
  for (const email of allRecipients) {
    await send(email, subjectLine("Reject", docTitle), rejectHtml);
  }
}

export async function sendOwnerPendingReminderEmail(opts: {
  ownerEmail: string;
  ownerName: string;
  docId: number;
  docTitle: string;
  pendingSigners: { name: string; email: string }[];
}) {
  const { ownerEmail, ownerName, docId, docTitle, pendingSigners } = opts;
  const link = docLink(docId);
  const signerRows = pendingSigners
    .map((s) => `<tr><td style="font-size:13px;color:#374151;padding:4px 0">• ${s.name} &lt;${s.email}&gt;</td></tr>`)
    .join("");
  const html = baseLayout("Info", `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111">Reminder: Document Awaiting Signatures</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px">Hi ${ownerName}, your document is still waiting for the following signer${pendingSigners.length > 1 ? "s" : ""} to complete their signature.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:8px">
      <tr><td style="font-size:13px;color:#374151;padding-bottom:8px"><strong>Document:</strong> ${docTitle}</td></tr>
      <tr><td style="font-size:13px;color:#374151;padding-bottom:4px"><strong>Pending signers:</strong></td></tr>
      ${signerRows}
    </table>
    <p style="font-size:13px;color:#6b7280">You may want to follow up with them directly.</p>
    ${btn("View Document", link, "#2563eb")}
  `);
  await send(ownerEmail, subjectLine("Info", `Reminder — ${docTitle}`), html);
}

export async function sendReminderEmail(opts: {
  signerName: string;
  signerEmail: string;
  docId: number;
  docTitle: string;
  uploaderName: string;
}) {
  const { signerName, signerEmail, docId, docTitle, uploaderName } = opts;
  const link = docLink(docId);
  const html = baseLayout("Action", `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111">Reminder: Pending Signature Required</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px">Hi ${signerName}, this is a friendly reminder that your signature is still pending on the following document.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:8px">
      <tr><td style="font-size:13px;color:#374151"><strong>Document:</strong> ${docTitle}</td></tr>
      <tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Requested by:</strong> ${uploaderName}</td></tr>
    </table>
    <p style="font-size:13px;color:#6b7280">Please take action at your earliest convenience.</p>
    ${btn("Open & Sign Document", link, "#d97706")}
  `);
  await send(signerEmail, subjectLine("Action", `Reminder — ${docTitle}`), html);
}

export async function notifyDocumentVoided(opts: {
  docId: number;
  docTitle: string;
  voidedByName: string;
  reason?: string;
  uploaderEmail: string;
  allSignerEmails: string[];
  ccEmails: string[];
}) {
  const { docId, docTitle, voidedByName, reason, uploaderEmail, allSignerEmails, ccEmails } = opts;
  const link = docLink(docId);

  const voidHtml = baseLayout("Void", `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111">Document Voided</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px">This document has been voided and is no longer active.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:8px">
      <tr><td style="font-size:13px;color:#374151"><strong>Document:</strong> ${docTitle}</td></tr>
      <tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Voided by:</strong> ${voidedByName}</td></tr>
      ${reason ? `<tr><td style="font-size:13px;color:#374151;padding-top:6px"><strong>Reason:</strong> ${reason}</td></tr>` : ""}
    </table>
    <p style="font-size:13px;color:#6b7280">No further action is required. The document has been permanently voided.</p>
    ${btn("View Document", link, "#6b7280")}
  `);

  const allRecipients = [...new Set([uploaderEmail, ...allSignerEmails, ...ccEmails])];
  for (const email of allRecipients) {
    await send(email, subjectLine("Void", docTitle), voidHtml);
  }
}
