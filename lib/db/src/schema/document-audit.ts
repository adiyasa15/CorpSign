import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";

export const documentAuditTable = pgTable("document_audit_log", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  actorId: integer("actor_id"),
  actorName: text("actor_name").notNull(),
  actorEmail: text("actor_email").notNull(),
  actorIp: text("actor_ip"),
  eventType: text("event_type").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DocumentAudit = typeof documentAuditTable.$inferSelect;
export type InsertDocumentAudit = typeof documentAuditTable.$inferInsert;
