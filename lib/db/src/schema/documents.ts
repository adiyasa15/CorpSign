import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentStatusEnum = pgEnum("document_status", ["pending", "signed", "rejected", "in_progress", "completed", "draft"]);

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  filePath: text("file_path"),
  fileSize: integer("file_size").notNull(),
  status: documentStatusEnum("status").notNull().default("pending"),
  signerName: text("signer_name").notNull().default(""),
  signerEmail: text("signer_email").notNull().default(""),
  uploadedById: integer("uploaded_by_id"),
  signedAt: timestamp("signed_at"),
  signatureData: text("signature_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
