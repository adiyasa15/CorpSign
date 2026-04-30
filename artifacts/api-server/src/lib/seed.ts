import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function seedSuperAdmin() {
  const email = "tandatangan@tandatanganin.local";
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    return;
  }
  const passwordHash = await bcrypt.hash("T4nda123#", 12);
  await db.insert(usersTable).values({
    name: "Super Admin",
    email,
    phone: "+62",
    role: "superadmin",
    passwordHash,
    isActive: true,
  });
  logger.info("Superadmin seeded — login: tandatangan@tandatanganin.local / T4nda123#");
}
