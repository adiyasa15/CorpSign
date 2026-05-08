import { pgTable, serial, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const RoleCapabilitiesSchema = z.object({
  addUser: z.boolean(),
  uploadDocument: z.boolean(),
  approveDocument: z.boolean(),
  viewAllDocuments: z.boolean(),
  manageSignatures: z.boolean(),
});

export type RoleCapabilities = z.infer<typeof RoleCapabilitiesSchema>;

export const AllRoleCapabilitiesSchema = z.object({
  admin: RoleCapabilitiesSchema,
  user: RoleCapabilitiesSchema,
  approver: RoleCapabilitiesSchema,
});

export type AllRoleCapabilities = z.infer<typeof AllRoleCapabilitiesSchema>;

export const defaultCapabilities: AllRoleCapabilities = {
  admin: {
    addUser: true,
    uploadDocument: true,
    approveDocument: true,
    viewAllDocuments: true,
    manageSignatures: true,
  },
  user: {
    addUser: false,
    uploadDocument: true,
    approveDocument: false,
    viewAllDocuments: false,
    manageSignatures: true,
  },
  approver: {
    addUser: false,
    uploadDocument: false,
    approveDocument: true,
    viewAllDocuments: true,
    manageSignatures: false,
  },
};

export const privilegesTable = pgTable("privileges", {
  id: serial("id").primaryKey(),
  maxAdminAccounts: integer("max_admin_accounts").notNull().default(10),
  maxUsersPerAdmin: integer("max_users_per_admin").notNull().default(50),
  maxUploadSizeMb: integer("max_upload_size_mb").notNull().default(10),
  roleCapabilities: jsonb("role_capabilities").$type<AllRoleCapabilities>().notNull().$default(() => defaultCapabilities),
  reminderDelayHours: integer("reminder_delay_hours").notNull().default(24),
  reminderDelayMinutes: integer("reminder_delay_minutes").notNull().default(0),
  showFreeTrial: boolean("show_free_trial").notNull().default(true),
  showSubscribe: boolean("show_subscribe").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Privileges = typeof privilegesTable.$inferSelect;
