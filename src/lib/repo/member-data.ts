import { and, asc, count, eq, gt, or, type AnyColumn } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact, message, prayerRequest } from '@/db/schema';
import type { ExportMessageRow, ExportPrayerRow } from '@/lib/member-export';

/** Everything the panel and the export need about ONE member.
 *
 *  Church-scoped like every other repo here: each query carries both predicates,
 *  church_id AND the row key, so another church's contactId is simply not found
 *  rather than found-and-then-checked. tests/repo-isolation.test.ts attacks these
 *  with two churches. */

export interface MemberSubject {
  id: string;
  name: string | null;
  phone: string;
  mode: 'bot' | 'awaiting_prayer' | 'human';
  lastInboundAt: Date | null;
  createdAt: Date;
}

export async function loadMemberSubject(
  churchId: string,
  contactId: string,
): Promise<MemberSubject | null> {
  const rows = await db
    .select({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      mode: contact.mode,
      lastInboundAt: contact.lastInboundAt,
      createdAt: contact.createdAt,
    })
    .from(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.id, contactId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface MemberCounts {
  messages: number;
  prayers: number;
  /** Prayers the church has not marked as prayed for. Surfaced separately because
   *  deleting them is a real pastoral cost the secretary should absorb knowingly,
   *  not discover afterwards. */
  prayersNovo: number;
}

export async function countMemberRows(churchId: string, contactId: string): Promise<MemberCounts> {
  const [m] = await db
    .select({ n: count() })
    .from(message)
    .where(and(eq(message.churchId, churchId), eq(message.contactId, contactId)));
  const [p] = await db
    .select({ n: count() })
    .from(prayerRequest)
    .where(and(eq(prayerRequest.churchId, churchId), eq(prayerRequest.contactId, contactId)));
  const [pn] = await db
    .select({ n: count() })
    .from(prayerRequest)
    .where(and(
      eq(prayerRequest.churchId, churchId),
      eq(prayerRequest.contactId, contactId),
      eq(prayerRequest.status, 'novo'),
    ));
  return { messages: m?.n ?? 0, prayers: p?.n ?? 0, prayersNovo: pn?.n ?? 0 };
}

/** A position in a keyset page: the last row handed out. */
export interface Cursor {
  createdAt: Date;
  id: string;
}

/** Keyset, not OFFSET. Two reasons: OFFSET re-scans everything it skips, and it
 *  is unstable under concurrent inserts — a member writing mid-export would shift
 *  every later page and duplicate or drop rows. The (created_at, id) pair is
 *  total: id breaks ties between rows sharing a millisecond, which is the case a
 *  date-granular cursor provably cannot split in either direction.
 *
 *  Covered by message_contact_keyset_idx (church_id, contact_id, created_at, id) —
 *  exactly these four columns, in this order. Shared by both pageMessages and
 *  pagePrayers, so the columns are typed by shape (a Date column, a string/uuid
 *  column) rather than pinned to `typeof message.createdAt` — pinning to one
 *  table's branded column type would make this reject the other table's columns
 *  at compile time even though the SQL it builds is identical either way. */
function keysetAfter(
  createdAtCol: AnyColumn<{ data: Date }>,
  idCol: AnyColumn<{ data: string }>,
  after: Cursor | null,
) {
  if (!after) return undefined;
  return or(
    gt(createdAtCol, after.createdAt),
    and(eq(createdAtCol, after.createdAt), gt(idCol, after.id)),
  );
}

export async function pageMessages(
  churchId: string,
  contactId: string,
  after: Cursor | null,
  limit: number,
): Promise<ExportMessageRow[]> {
  return db
    .select({
      id: message.id,
      waMessageId: message.waMessageId,
      direction: message.direction,
      body: message.body,
      createdAt: message.createdAt,
    })
    .from(message)
    .where(and(
      eq(message.churchId, churchId),
      eq(message.contactId, contactId),
      keysetAfter(message.createdAt, message.id, after),
    ))
    .orderBy(asc(message.createdAt), asc(message.id))
    .limit(limit);
}

export async function pagePrayers(
  churchId: string,
  contactId: string,
  after: Cursor | null,
  limit: number,
): Promise<ExportPrayerRow[]> {
  return db
    .select({
      id: prayerRequest.id,
      status: prayerRequest.status,
      text: prayerRequest.text,
      createdAt: prayerRequest.createdAt,
    })
    .from(prayerRequest)
    .where(and(
      eq(prayerRequest.churchId, churchId),
      eq(prayerRequest.contactId, contactId),
      keysetAfter(prayerRequest.createdAt, prayerRequest.id, after),
    ))
    .orderBy(asc(prayerRequest.createdAt), asc(prayerRequest.id))
    .limit(limit);
}

/** ONE statement. message.contact_id and prayer_request.contact_id are both
 *  ON DELETE CASCADE, and a single statement in Postgres runs in an implicit
 *  transaction — so the cascade is atomic even though neon-http has no
 *  db.transaction. This is the whole answer to "a multi-table delete will fail
 *  halfway": there is no multi-table delete.
 *
 *  Returns 0 or 1. Idempotent, which is what makes the erasure retry path and the
 *  nightly sweep safe to run against a member who is already gone. */
export async function deleteMember(churchId: string, contactId: string): Promise<number> {
  const deleted = await db
    .delete(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.id, contactId)))
    .returning({ id: contact.id });
  return deleted.length;
}

/** Art. 18 III, correction. Durable by accident of a good design elsewhere:
 *  findOrCreateContact returns an existing row UNTOUCHED, and no code path writes
 *  contact.name after creation, so a corrected name survives the member's next
 *  inbound message. Had that not been true the correction right would have been
 *  void within seconds of being exercised. */
export async function renameContact(
  churchId: string,
  contactId: string,
  name: string,
): Promise<number> {
  const updated = await db
    .update(contact)
    .set({ name })
    .where(and(eq(contact.churchId, churchId), eq(contact.id, contactId)))
    .returning({ id: contact.id });
  return updated.length;
}
