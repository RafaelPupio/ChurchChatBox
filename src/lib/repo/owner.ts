import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { ownerUser } from '@/db/schema';

export type OwnerRecord = typeof ownerUser.$inferSelect;

export async function findOwnerByEmail(email: string): Promise<OwnerRecord | undefined> {
  const rows = await db.select().from(ownerUser).where(eq(ownerUser.email, email)).limit(1);
  return rows[0];
}

/** Used by the guard on every request: a session cookie proves who you were, not
 *  that the account still exists. A revoked owner must lose access immediately,
 *  not whenever their cookie happens to expire. */
export async function findOwnerById(id: string): Promise<OwnerRecord | undefined> {
  const rows = await db.select().from(ownerUser).where(eq(ownerUser.id, id)).limit(1);
  return rows[0];
}

export async function createOwner(o: {
  email: string;
  passwordHash: string;
  name: string | null;
}): Promise<OwnerRecord> {
  const [created] = await db.insert(ownerUser).values(o).returning();
  if (!created) throw new Error('createOwner: insert returned no row');
  return created;
}
