import { Router } from "express";
import { db } from "@workspace/db";
import { privilegesTable, defaultCapabilities } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

async function getOrCreatePrivileges() {
  const rows = await db.select().from(privilegesTable).limit(1);
  if (rows.length > 0) return rows[0];
  const inserted = await db
    .insert(privilegesTable)
    .values({
      maxAdminAccounts: 10,
      maxUsersPerAdmin: 50,
      maxUploadSizeMb: 10,
      roleCapabilities: defaultCapabilities,
      showFreeTrial: true,
      showSubscribe: true,
    })
    .returning();
  return inserted[0];
}

// Fully public: register page needs this before the user logs in
router.get("/privileges/register-config", async (req, res) => {
  try {
    const priv = await getOrCreatePrivileges();
    res.json({
      showFreeTrial: priv.showFreeTrial ?? true,
      showSubscribe: priv.showSubscribe ?? true,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Public limits endpoint (any authenticated user)
router.get("/privileges/limits", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const priv = await getOrCreatePrivileges();
    res.json({
      maxAdminAccounts: priv.maxAdminAccounts,
      maxUsersPerAdmin: priv.maxUsersPerAdmin,
      maxUploadSizeMb: priv.maxUploadSizeMb,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/privileges", requireSuperAdmin, async (req, res) => {
  try {
    const priv = await getOrCreatePrivileges();
    res.json(priv);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const RoleCapabilitiesSchema = z.object({
  addUser: z.boolean(),
  uploadDocument: z.boolean(),
  approveDocument: z.boolean(),
  viewAllDocuments: z.boolean(),
  manageSignatures: z.boolean(),
});

const UpdatePrivilegesBody = z.object({
  maxAdminAccounts: z.number().int().min(1).max(9999),
  maxUsersPerAdmin: z.number().int().min(1).max(9999),
  maxUploadSizeMb: z.number().int().refine((v) => [10, 20, 30, 40, 50].includes(v), {
    message: "Must be one of 10, 20, 30, 40, 50",
  }),
  roleCapabilities: z.object({
    admin: RoleCapabilitiesSchema,
    user: RoleCapabilitiesSchema,
    approver: RoleCapabilitiesSchema,
  }),
  reminderDelayHours: z.number().int().min(0).max(720),
  reminderDelayMinutes: z.number().int().min(0).max(59),
  showFreeTrial: z.boolean(),
  showSubscribe: z.boolean(),
});

router.put("/privileges", requireSuperAdmin, async (req, res) => {
  try {
    const parsed = UpdatePrivilegesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      return;
    }
    const priv = await getOrCreatePrivileges();
    const updated = await db
      .update(privilegesTable)
      .set({
        maxAdminAccounts: parsed.data.maxAdminAccounts,
        maxUsersPerAdmin: parsed.data.maxUsersPerAdmin,
        maxUploadSizeMb: parsed.data.maxUploadSizeMb,
        roleCapabilities: parsed.data.roleCapabilities,
        reminderDelayHours: parsed.data.reminderDelayHours,
        reminderDelayMinutes: parsed.data.reminderDelayMinutes,
        showFreeTrial: parsed.data.showFreeTrial,
        showSubscribe: parsed.data.showSubscribe,
        updatedAt: new Date(),
      })
      .where(eq(privilegesTable.id, priv.id))
      .returning();
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
