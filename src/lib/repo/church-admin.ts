import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { church } from '@/db/schema';

export type ChurchRecord = typeof church.$inferSelect;

/** The single church row — used by the bootstrap script. v1 has exactly one. */
export async function getChurchRecord(): Promise<ChurchRecord | undefined> {
  const rows = await db.select().from(church).limit(1);
  return rows[0];
}

export async function getChurchById(churchId: string): Promise<ChurchRecord | undefined> {
  const rows = await db.select().from(church).where(eq(church.id, churchId)).limit(1);
  return rows[0];
}

export async function updateChurch(
  churchId: string,
  fields: Partial<typeof church.$inferInsert>,
): Promise<void> {
  await db.update(church).set(fields).where(eq(church.id, churchId));
}
