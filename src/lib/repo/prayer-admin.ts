import { and, asc, count, desc, eq, gt, lt, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact, prayerRequest } from '@/db/schema';

export interface PrayerRequestWithContact {
  id: string;
  text: string;
  status: 'novo' | 'orado';
  createdAt: Date;
  /** Needed so the prayer list can link to the member data page. Not exposed
   *  before this subsystem. */
  contactId: string;
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
      contactId: prayerRequest.contactId,
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

export interface ExpiringPrayerRow {
  id: string;
  text: string;
  status: 'novo' | 'orado';
  createdAt: Date;
  contactName: string | null;
  contactPhone: string;
}

/** How many prayer requests the next 30 days of purges will destroy.
 *
 *  `before` is retentionCutoff(now) + 30 days, computed by the caller so this
 *  function stays a query and the window stays a product decision in one place. */
export async function countExpiringPrayers(churchId: string, before: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(prayerRequest)
    .where(and(eq(prayerRequest.churchId, churchId), lt(prayerRequest.createdAt, before)));
  return row?.n ?? 0;
}

/** Exactly the set the warning counts — not the church's whole prayer archive.
 *  A full archive is a whole-church backup, which is out of scope on its own risk
 *  grounds; a warning-driven export should hand over the thing about to be lost
 *  and nothing else.
 *
 *  The join is church-scoped on BOTH predicates, like listPrayerRequests: matching
 *  on contactId alone would render another church's member name and phone number
 *  if a row's church_id and contact_id ever disagreed. */
export async function pageExpiringPrayers(
  churchId: string,
  before: Date,
  after: { createdAt: Date; id: string } | null,
  limit: number,
): Promise<ExpiringPrayerRow[]> {
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
    .innerJoin(contact, and(eq(prayerRequest.contactId, contact.id), eq(contact.churchId, churchId)))
    .where(and(
      eq(prayerRequest.churchId, churchId),
      lt(prayerRequest.createdAt, before),
      after
        ? or(
            gt(prayerRequest.createdAt, after.createdAt),
            and(eq(prayerRequest.createdAt, after.createdAt), gt(prayerRequest.id, after.id)),
          )
        : undefined,
    ))
    .orderBy(asc(prayerRequest.createdAt), asc(prayerRequest.id))
    .limit(limit);
}
