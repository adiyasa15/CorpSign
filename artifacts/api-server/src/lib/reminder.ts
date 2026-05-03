import { db } from "@workspace/db";
import { documentSignersTable, documentsTable, privilegesTable, usersTable } from "@workspace/db";
import { eq, isNull, and, lte, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { sendReminderEmail } from "./mailer";
import { telegramReminderNotification } from "./telegram";

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
    if (delayMs <= 0) return;

    const cutoff = new Date(Date.now() - delayMs);

    // Find pending signers whose document was created before the cutoff and no reminder sent yet
    const pendingSigners = await db
      .select({
        signerId: documentSignersTable.id,
        signerName: documentSignersTable.name,
        signerEmail: documentSignersTable.email,
        documentId: documentSignersTable.documentId,
        docTitle: documentsTable.title,
        docCreatedAt: documentsTable.createdAt,
        uploaderEmail: usersTable.email,
        uploaderName: usersTable.name,
      })
      .from(documentSignersTable)
      .innerJoin(documentsTable, eq(documentSignersTable.documentId, documentsTable.id))
      .leftJoin(usersTable, eq(documentsTable.uploadedById, usersTable.id))
      .where(
        and(
          eq(documentSignersTable.status, "pending"),
          isNull(documentSignersTable.reminderSentAt),
          lte(documentsTable.createdAt, cutoff),
          inArray(documentsTable.status, ["pending", "in_progress"]),
        ),
      );

    if (pendingSigners.length === 0) return;

    logger.info({ count: pendingSigners.length }, "Sending pending-action reminders");

    for (const signer of pendingSigners) {
      try {
        // Send email reminder
        await sendReminderEmail({
          signerName: signer.signerName,
          signerEmail: signer.signerEmail,
          docId: signer.documentId,
          docTitle: signer.docTitle,
          uploaderName: signer.uploaderName ?? "the document owner",
        });

        // Send Telegram reminder
        await telegramReminderNotification({
          signerEmail: signer.signerEmail,
          signerName: signer.signerName,
          docId: signer.documentId,
          docTitle: signer.docTitle,
          uploaderName: signer.uploaderName ?? "the document owner",
        });

        // Mark reminder as sent
        await db
          .update(documentSignersTable)
          .set({ reminderSentAt: new Date() })
          .where(eq(documentSignersTable.id, signer.signerId));

        logger.info({ signerId: signer.signerId, email: signer.signerEmail }, "Reminder sent");
      } catch (err) {
        logger.error({ err, signerId: signer.signerId }, "Failed to send reminder");
      }
    }
  } catch (err) {
    logger.error({ err }, "Reminder check failed");
  }
}

export function startReminderScheduler(): void {
  logger.info("Reminder scheduler started");
  // Run once after 1 minute on startup, then every CHECK_INTERVAL_MS
  setTimeout(() => {
    void runReminderCheck();
    setInterval(() => { void runReminderCheck(); }, CHECK_INTERVAL_MS);
  }, 60_000);
}
