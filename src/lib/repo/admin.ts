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

/** Writes a new password and stamps the session-revocation epoch.
 *
 *  ONE statement on purpose. `password_hash` and `password_changed_at` must move
 *  together or the epoch stops meaning what the session guard believes it means:
 *  hash written without the stamp leaves every old session — including an
 *  attacker's — alive after a reset, and a stamp written without the hash logs
 *  everyone out while the compromised password still works. neon-http gives no
 *  transaction to bind two statements, so they are one SET.
 *
 *  `changedAt` is supplied by the caller rather than taken from the database
 *  clock, because the caller has to seal that exact value into its own session
 *  cookie afterwards — a `now()` computed inside Postgres is a value the app
 *  would have to read back to know.
 *
 *  Returns the stamp that was written, or NULL when the admin row no longer
 *  exists. Callers must not treat "no row" as success: without transactions, an
 *  account can be removed between the check that found it and this write, and
 *  reporting "sua nova senha já está valendo" for a password nobody stored would
 *  leave someone locked out and certain they were not. */
export async function updateAdminPassword(
  id: string,
  passwordHash: string,
  changedAt: Date = new Date(),
): Promise<Date | null> {
  const updated = await db
    .update(adminUser)
    .set({ passwordHash, passwordChangedAt: changedAt })
    .where(eq(adminUser.id, id))
    .returning({ passwordChangedAt: adminUser.passwordChangedAt });
  return updated[0]?.passwordChangedAt ?? null;
}

export async function listAdmins(churchId: string): Promise<AdminRecord[]> {
  return db.select().from(adminUser).where(eq(adminUser.churchId, churchId));
}

/** Church-scoped so one church's admin can never delete another church's staff by id. */
export async function deleteAdmin(id: string, churchId: string): Promise<void> {
  await db.delete(adminUser).where(and(eq(adminUser.id, id), eq(adminUser.churchId, churchId)));
}
