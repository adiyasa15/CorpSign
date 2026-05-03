import { pgTable, serial, text, timestamp, pgEnum, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["superadmin", "admin", "user", "approver"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  companyName: text("company_name"),
  division: text("division"),
  role: userRoleEnum("role").notNull().default("user"),
  googleId: text("google_id").unique(),
  passwordHash: text("password_hash"),
  telegramChatId: text("telegram_chat_id"),
  isActive: boolean("is_active").notNull().default(true),
  pendingApproval: boolean("pending_approval").notNull().default(false),
  groupId: integer("group_id"),
  isGroupOwner: boolean("is_group_owner").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
