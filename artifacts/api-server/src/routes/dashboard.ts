import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, signaturesTable, activityTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  try {
    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        signed: sql<number>`count(*) filter (where status = 'signed')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      })
      .from(documentsTable);

    const [sigTotal] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(signaturesTable);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const [sigMonth] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(activityTable)
      .where(and(eq(activityTable.action, "signed"), gte(activityTable.timestamp, thisMonth)));

    res.json({
      totalDocuments: totals.total,
      pendingDocuments: totals.pending,
      signedDocuments: totals.signed,
      rejectedDocuments: totals.rejected,
      totalSignatures: sigTotal.total,
      signaturesThisMonth: sigMonth.total,
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
