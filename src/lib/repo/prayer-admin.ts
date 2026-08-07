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
    // The join is church-scoped too, not just the WHERE. Matching on contactId
    // alone means a prayer_request whose church_id and contact_id disagree (a bad
    // backfill, a future bulk import) would render ANOTHER church's member name
    // and phone number in this church's prayer list. Two predicates make the row
    // simply not appear instead.
    .innerJoin(contact, and(eq(prayerRequest.contactId, contact.id), eq(contact.churchId, churchId)))
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
