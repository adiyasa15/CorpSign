import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";

export const activityActionEnum = pgEnum("activity_action", ["uploaded", "signed", "rejected", "viewed"]);

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  documentTitle: text("document_title").notNull(),
  action: activityActionEnum("action").notNull(),
  signerName: text("signer_name").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activityTable).omit({ id: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
