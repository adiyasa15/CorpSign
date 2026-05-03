import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const packageTypeEnum = pgEnum("package_type", ["free_trial", "subscribed", "custom"]);

export const packagesTable = pgTable("packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: packageTypeEnum("type").notNull(),
  maxDocuments: integer("max_documents"),
  maxSignersPerDoc: integer("max_signers_per_doc"),
  maxUploadMb: integer("max_upload_mb").notNull().default(5),
  maxUploaderUsers: integer("max_uploader_users").notNull().default(1),
  maxTotalUsers: integer("max_total_users").notNull().default(1),
  activeDays: integer("active_days").notNull().default(14),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Package = typeof packagesTable.$inferSelect;
export type InsertPackage = typeof packagesTable.$inferInsert;
