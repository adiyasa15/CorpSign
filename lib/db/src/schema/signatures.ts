import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signatureTypeEnum = pgEnum("signature_type", ["drawn", "typed", "uploaded"]);

export const signaturesTable = pgTable("signatures", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  signatureData: text("signature_data").notNull(),
  type: signatureTypeEnum("type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSignatureSchema = createInsertSchema(signaturesTable).omit({ id: true, createdAt: true });
export type InsertSignature = z.infer<typeof insertSignatureSchema>;
export type Signature = typeof signaturesTable.$inferSelect;
