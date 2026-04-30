import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const signatureTemplatesTable = pgTable("signature_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  templateType: text("template_type").notNull(),
  name: text("name"),
  imageData: text("image_data").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SignatureTemplate = typeof signatureTemplatesTable.$inferSelect;
export type InsertSignatureTemplate = typeof signatureTemplatesTable.$inferInsert;
