import { db } from "@workspace/db";
import { documentSignersTable, documentsTable, privilegesTable, usersTable } from "@workspace/db";
import { eq, isNull, isNotNull, and, or, lte, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { sendReminderEmail, sendOwnerPendingReminderEmail } from "./mailer";
import { telegramReminderNotification, telegramOwnerPendingReminder } from "./telegram";
import { whatsappReminderNotification, whatsappOwnerPendingReminder } from "./whatsapp";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

async function getDelayMs(): Promise<number> {
  try {
    const rows = await db.select({
      reminderDelayHours: privilegesTable.reminderDelayHours,
      reminderDelayMinutes: privilegesTable.reminderDelayMinutes,
    }).from(privilegesTable).limit(1);
    if (rows.length === 0) return 24 * 60 * 60 * 1000;
    const { reminderDelayHours, reminderDelayMinutes } = rows[0];
    return (reminderDelayHours * 60 + reminderDelayMinutes) * 60 * 1000;
  } catch {
    return 24 * 60 * 60 * 1000;
  }
}

async function runReminderCheck(): Promise<void> {
  try {
    const delayMs = await getDelayMs();
    if (delayMs <= 0) {
      logger.info("Reminders disabled (delay = 0), skipping check");
      return;
    }

    const cutoff = new Date(Date.now() - delayMs);
    logger.info({ delayMs, cutoff }, "Running reminder check");

    // ── 1. Notify pending signers ────────────────────────────────────────────
    // Send if:
    //   a) Never reminded yet AND document was created before cutoff, OR
    //   b) Already reminded but last reminder was before cutoff (repeat reminder)
    const pendingSigners = await db
      .select({
        signerId: documentSignersTable.id,
        signerName: documentSignersTable.name,
        signerEmail: documentSignersTable.email,
        documentId: documentSignersTable.documentId,
        docTitle: documentsTable.title,
        uploaderEmail: usersTable.email,
        uploaderName: usersTable.name,
      })
      .from(documentSignersTable)
      .innerJoin(documentsTable, eq(documentSignersTable.documentId, documentsTable.id))
      .leftJoin(usersTable, eq(documentsTable.uploadedById, usersTable.id))
      .where(
        and(
          eq(documentSignersTable.status, "pending"),
          inArray(documentsTable.status, ["pending", "in_progress"]),
          or(
            // First reminder: never sent, document old enough
            and(
              isNull(documentSignersTable.reminderSentAt),
              lte(documentsTable.createdAt, cutoff),
            ),
            // Repeat reminder: last reminder was sent before cutoff
            and(
              isNotNull(documentSignersTable.reminderSentAt),
              lte(documentSignersTable.reminderSentAt, cutoff),
            ),
          ),
        ),
      );

    if (pendingSigners.length > 0) {
      logger.info({ count: pendingSigners.length }, "Sending pending-action reminders to signers");

      for (const signer of pendingSigners) {
        try {
          await sendReminderEmail({
            signerName: signer.signerName,
            signerEmail: signer.signerEmail,
            docId: signer.documentId,
            docTitle: signer.docTitle,
            uploaderName: signer.uploaderName ?? "the document owner",
          });

          await telegramReminderNotification({
            signerEmail: signer.signerEmail,
            signerName: signer.signerName,
            docId: signer.documentId,
            docTitle: signer.docTitle,
            uploaderName: signer.uploaderName ?? "the document owner",
          });

          await whatsappReminderNotification({
            signerEmail: signer.signerEmail,
            signerName: signer.signerName,
            docId: signer.documentId,
            docTitle: signer.docTitle,
            uploaderName: signer.uploaderName ?? "the document owner",
          });

          await db
            .update(documentSignersTable)
            .set({ reminderSentAt: new Date() })
            .where(eq(documentSignersTable.id, signer.signerId));

          logger.info({ signerId: signer.signerId, email: signer.signerEmail }, "Signer reminder sent");
        } catch (err) {
          logger.error({ err, signerId: signer.signerId }, "Failed to send signer reminder");
        }
      }
    } else {
      logger.info("No signers due for a reminder");
    }

    // ── 2. Notify document owners whose docs are still pending ───────────────
    // Send if:
    //   a) Never reminded yet AND document was created before cutoff, OR
    //   b) Already reminded but last reminder was before cutoff (repeat reminder)
    const pendingDocs = await db
      .select({
        docId: documentsTable.id,
        docTitle: documentsTable.title,
        ownerEmail: usersTable.email,
        ownerName: usersTable.name,
        ownerReminderSentAt: documentsTable.ownerReminderSentAt,
      })
      .from(documentsTable)
      .innerJoin(usersTable, eq(documentsTable.uploadedById, usersTable.id))
      .where(
        and(
          inArray(documentsTable.status, ["pending", "in_progress"]),
          or(
            // First reminder: never sent, document old enough
            and(
              isNull(documentsTable.ownerReminderSentAt),
              lte(documentsTable.createdAt, cutoff),
            ),
            // Repeat reminder: last reminder was sent before cutoff
            and(
              isNotNull(documentsTable.ownerReminderSentAt),
              lte(documentsTable.ownerReminderSentAt, cutoff),
            ),
          ),
        ),
      );

    if (pendingDocs.length > 0) {
      logger.info({ count: pendingDocs.length }, "Sending pending-document reminders to owners");

      for (const doc of pendingDocs) {
        if (!doc.ownerEmail) continue;
        try {
          const stillPending = await db
            .select({
              name: documentSignersTable.name,
              email: documentSignersTable.email,
            })
            .from(documentSignersTable)
            .where(
              and(
                eq(documentSignersTable.documentId, doc.docId),
                eq(documentSignersTable.status, "pending"),
              ),
            );

          if (stillPending.length === 0) {
            // No pending signers left — mark without sending
            await db
              .update(documentsTable)
              .set({ ownerReminderSentAt: new Date() })
              .where(eq(documentsTable.id, doc.docId));
            continue;
          }

          await sendOwnerPendingReminderEmail({
            ownerEmail: doc.ownerEmail,
            ownerName: doc.ownerName ?? "Document Owner",
            docId: doc.docId,
            docTitle: doc.docTitle,
            pendingSigners: stillPending,
          });

          await telegramOwnerPendingReminder({
            ownerEmail: doc.ownerEmail,
            ownerName: doc.ownerName ?? "Document Owner",
            docId: doc.docId,
            docTitle: doc.docTitle,
            pendingSigners: stillPending,
          });

          await whatsappOwnerPendingReminder({
            ownerEmail: doc.ownerEmail,
            ownerName: doc.ownerName ?? "Document Owner",
            docId: doc.docId,
            docTitle: doc.docTitle,
            pendingSigners: stillPending,
          });

          await db
            .update(documentsTable)
            .set({ ownerReminderSentAt: new Date() })
            .where(eq(documentsTable.id, doc.docId));

          logger.info({ docId: doc.docId, ownerEmail: doc.ownerEmail }, "Owner reminder sent");
        } catch (err) {
          logger.error({ err, docId: doc.docId }, "Failed to send owner reminder");
        }
      }
    } else {
      logger.info("No document owners due for a reminder");
    }
  } catch (err) {
    logger.error({ err }, "Reminder check failed");
  }
}

export function startReminderScheduler(): void {
  logger.info({ checkIntervalMs: CHECK_INTERVAL_MS }, "Reminder scheduler started");
  // Run once after a short delay, then repeat on every CHECK_INTERVAL_MS
  setTimeout(() => {
    void runReminderCheck();
    setInterval(() => { void runReminderCheck(); }, CHECK_INTERVAL_MS);
  }, 60_000);
}
