import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { adminUser } from '@/db/schema';

export type AdminRecord = typeof adminUser.$inferSelect;

export async function findAdminByEmail(email: string): Promise<AdminRecord | undefined> {
  const rows = await db.select().from(adminUser).where(eq(adminUser.email, email)).limit(1);
  return rows[0];
}

/** Used by the write guard: confirms the admin row still exists, so a removed
 *  staff member loses access immediately rather than when their cookie expires. */
export async function findAdminById(id: string): Promise<AdminRecord | undefined> {
  const rows = await db.select().from(adminUser).where(eq(adminUser.id, id)).limit(1);
  return rows[0];
}

export async function createAdmin(a: {
  churchId: string;
  email: string;
  passwordHash: string;
  name: string | null;
}): Promise<AdminRecord> {
  const [created] = await db.insert(adminUser).values(a).returning();
  return created;
}

export async function listAdmins(churchId: string): Promise<AdminRecord[]> {
  return db.select().from(adminUser).where(eq(adminUser.churchId, churchId));
}

/** Church-scoped so one church's admin can never delete another church's staff by id. */
export async function deleteAdmin(id: string, churchId: string): Promise<void> {
  await db.delete(adminUser).where(and(eq(adminUser.id, id), eq(adminUser.churchId, churchId)));
}
