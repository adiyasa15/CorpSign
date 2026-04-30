import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";
import { documentSignersTable } from "./document-signers";

export const documentFieldsTable = pgTable("document_fields", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  signerId: integer("signer_id").notNull().references(() => documentSignersTable.id, { onDelete: "cascade" }),
  fieldType: text("field_type").notNull(),
  page: integer("page").notNull().default(0),
  x: real("x").notNull(),
  y: real("y").notNull(),
  width: real("width").notNull(),
  height: real("height").notNull(),
  filledAt: timestamp("filled_at"),
  filledImage: text("filled_image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DocumentField = typeof documentFieldsTable.$inferSelect;
export type InsertDocumentField = typeof documentFieldsTable.$inferInsert;
