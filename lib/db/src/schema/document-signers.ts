import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";

export const documentSignersTable = pgTable("document_signers", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  signerOrder: integer("signer_order").notNull().default(0),
  status: text("status").notNull().default("pending"),
  color: text("color").notNull().default("#2563eb"),
  completedAt: timestamp("completed_at"),
  notified: boolean("notified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DocumentSigner = typeof documentSignersTable.$inferSelect;
export type InsertDocumentSigner = typeof documentSignersTable.$inferInsert;
