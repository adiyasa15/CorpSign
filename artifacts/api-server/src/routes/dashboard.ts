import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, signaturesTable, activityTable, usersTable, documentSignersTable } from "@workspace/db";
import { and, eq, gte, inArray, notInArray, or, sql } from "drizzle-orm";

const router = Router();

function canSeeAllDocs(role: string) {
  return role === "admin" || role === "superadmin";
}

router.get("/dashboard/summary", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const user = req.user;

    // Documents where this user is a signer
    const signerDocIds = await db
      .select({ documentId: documentSignersTable.documentId })
      .from(documentSignersTable)
      .where(eq(documentSignersTable.email, user.email))
      .then((rows) => rows.map((r) => r.documentId));

    let totalDocuments = 0;
    let signedDocuments = 0;
    let rejectedDocuments = 0;

    if (canSeeAllDocs(user.role)) {
      // Admins see global counts
      const [totals] = await db.select({
        total: sql<number>`count(*)::int`,
        signed: sql<number>`count(*) filter (where status = 'signed' or status = 'completed')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      }).from(documentsTable);

      totalDocuments = totals.total;
      signedDocuments = totals.signed;
      rejectedDocuments = totals.rejected;
    } else {
      // Regular users see only docs they own or are a signer on
      const baseCondition = signerDocIds.length > 0
        ? or(
            eq(documentsTable.uploadedById, user.id),
            inArray(documentsTable.id, signerDocIds)
          )!
        : eq(documentsTable.uploadedById, user.id);

      const [totals] = await db.select({
        total: sql<number>`count(*)::int`,
        signed: sql<number>`count(*) filter (where status = 'signed' or status = 'completed')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      }).from(documentsTable).where(baseCondition);

      totalDocuments = totals.total;
      signedDocuments = totals.signed;
      rejectedDocuments = totals.rejected;
    }

    // Pending signatures = documents where the current user is a signer with status 'pending'
    // and the document itself is still active (not completed/rejected/draft)
    const [pendingCount] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(documentSignersTable)
      .innerJoin(documentsTable, eq(documentsTable.id, documentSignersTable.documentId))
      .where(
        and(
          eq(documentSignersTable.email, user.email),
          eq(documentSignersTable.status, "pending"),
          notInArray(documentsTable.status, ["completed", "rejected", "draft"]),
        ),
      );

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const [sigTotal] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(signaturesTable);

    const [sigMonth] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(activityTable)
      .where(and(eq(activityTable.action, "signed"), gte(activityTable.timestamp, thisMonth)));

    const [pendingApprovals] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.pendingApproval, true));

    res.json({
      totalDocuments,
      pendingDocuments: pendingCount.total,
      signedDocuments,
      rejectedDocuments,
      totalSignatures: sigTotal.total,
      signaturesThisMonth: sigMonth.total,
      pendingApprovals: pendingApprovals.total,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/recent", async (req, res) => {
  try {
    const activity = await db
      .select()
      .from(activityTable)
      .orderBy(sql`${activityTable.timestamp} desc`)
      .limit(20);

    res.json(
      activity.map((a) => ({
        id: a.id,
        documentId: a.documentId,
        documentTitle: a.documentTitle,
        action: a.action,
        signerName: a.signerName,
        timestamp: a.timestamp.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
