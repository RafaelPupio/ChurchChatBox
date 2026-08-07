import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { church } from '@/db/schema';

export type ChurchRecord = typeof church.$inferSelect;

export async function getChurchById(churchId: string): Promise<ChurchRecord | undefined> {
  const rows = await db.select().from(church).where(eq(church.id, churchId)).limit(1);
  return rows[0];
}

export async function updateChurch(
  churchId: string,
  fields: Partial<typeof church.$inferInsert>,
): Promise<void> {
  // Strip id so a caller can never repoint the church row's primary key via .set().
  const { id: _id, ...safeFields } = fields;
  await db.update(church).set(safeFields).where(eq(church.id, churchId));
}
