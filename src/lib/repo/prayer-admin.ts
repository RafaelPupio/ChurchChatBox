import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact, prayerRequest } from '@/db/schema';

export interface PrayerRequestWithContact {
  id: string;
  text: string;
  status: 'novo' | 'orado';
  createdAt: Date;
  contactName: string | null;
  contactPhone: string;
}

export async function listPrayerRequests(churchId: string): Promise<PrayerRequestWithContact[]> {
  return db
    .select({
      id: prayerRequest.id,
      text: prayerRequest.text,
      status: prayerRequest.status,
      createdAt: prayerRequest.createdAt,
      contactName: contact.name,
      contactPhone: contact.phone,
    })
    .from(prayerRequest)
    .innerJoin(contact, eq(prayerRequest.contactId, contact.id))
    .where(eq(prayerRequest.churchId, churchId))
    .orderBy(desc(prayerRequest.createdAt));
}

export async function updatePrayerStatus(
  id: string,
  churchId: string,
  status: 'novo' | 'orado',
): Promise<void> {
  await db
    .update(prayerRequest)
    .set({ status })
    .where(and(eq(prayerRequest.id, id), eq(prayerRequest.churchId, churchId)));
}
