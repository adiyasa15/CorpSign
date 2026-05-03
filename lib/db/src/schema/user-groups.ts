import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { packagesTable } from "./packages";

export const userGroupsTable = pgTable("user_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  companyName: text("company_name"),
  packageId: integer("package_id").references(() => packagesTable.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  activatedAt: timestamp("activated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserGroup = typeof userGroupsTable.$inferSelect;
export type InsertUserGroup = typeof userGroupsTable.$inferInsert;
