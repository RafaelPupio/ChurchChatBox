import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { erasureRecord } from '@/db/schema';

/** The church's own view of its erasure receipts. Church-scoped; no query here
 *  spans churches. The vendor's cross-church view is a DIFFERENT function in the
 *  owner-only platform repo, with strictly fewer columns. */

export interface ErasureRecordRow {
  id: string;
  reason: 'subject_request' | 'retention';
  status: 'pending' | 'done';
  subjectContactId: string | null;
  subjectPhoneHash: string | null;
  performedByEmail: string | null;
  messagesDeleted: number;
  prayersDeleted: number;
  contactsDeleted: number;
  createdAt: Date;
  completedAt: Date | null;
}

const RECORD_COLUMNS = {
  id: erasureRecord.id,
  reason: erasureRecord.reason,
  status: erasureRecord.status,
  subjectContactId: erasureRecord.subjectContactId,
  subjectPhoneHash: erasureRecord.subjectPhoneHash,
  performedByEmail: erasureRecord.performedByEmail,
  messagesDeleted: erasureRecord.messagesDeleted,
  prayersDeleted: erasureRecord.prayersDeleted,
  contactsDeleted: erasureRecord.contactsDeleted,
  createdAt: erasureRecord.createdAt,
  completedAt: erasureRecord.completedAt,
};

export interface OpenSubjectErasureInput {
  churchId: string;
  contactId: string;
  phoneHash: string | null;
  performedByEmail: string;
  messages: number;
  prayers: number;
}

/** `created_at` read off a RAW statement, made into a Date that is safe to RENDER.
 *
 *  `sql` carries no column metadata, so drizzle has no timestamp mapper to apply
 *  and the value is whatever the driver chose: PGlite returns a Date, neon-http
 *  returns the string '2026-08-11 06:00:00.803+00'. That much is already the house
 *  convention — src/lib/repo/platform.ts has the same four lines and the incident
 *  comment above them, written after a `sql<Date>` assertion that was false in
 *  production and true in every test. platform.ts is OWNER-ONLY (C5) and cannot be
 *  imported here, so these four lines live in both places on purpose.
 *
 *  WHAT IS DIFFERENT HERE IS THE FALLBACK, and it is deliberately not null.
 *  platform.ts returns null because null has a rendering there ("nenhuma mensagem
 *  recebida ainda"). This value has no such rendering: it comes back as
 *  `recordedAt` and the page prints `Comprovante registrado em {fmt(recordedAt)}`
 *  at the moment a member's data is destroyed. The two rejected options:
 *
 *   - Leave it unguarded. `toLocaleDateString` on an Invalid Date returns the
 *     literal string "Invalid Date", so the single most consequential confirmation
 *     in the product would read "Comprovante registrado em Invalid Date."
 *   - Return null. That pushes `Date | null` through three call sites and two
 *     result shapes to arrive at an em-dash — a worse receipt than a good guess,
 *     for more code.
 *
 *  So the fallback is `observedAt`: the moment this process read the row it had
 *  just inserted. That is accurate to one round trip and is a TRUE statement about
 *  when the receipt was opened, which an em-dash is not. It is never silent — a
 *  timestamp we had to guess is a driver-shape defect and the vendor is the only
 *  party who can fix one. The value itself is not logged: it belongs to a row
 *  about one identified member, and Task 15's rule is that diagnostic value never
 *  buys that. Its type is the diagnostic that matters anyway.
 *
 *  Exported ONLY so the shapes neon-http might return can be tested; this suite can
 *  exercise PGlite and nothing else. No other module calls it. */
export function receiptCreatedAt(value: unknown, observedAt: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  console.error('[erasure] unparseable created_at on a fresh receipt; using the observation time', {
    type: typeof value,
  });
  return observedAt;
}

/** ONE statement, TWO guards, no pre-check.
 *
 *  Guard 1 — `SELECT … FROM contact WHERE c.id = $ AND c.church_id = $`: it is
 *  impossible to mint a receipt for a contact that is already gone, or for
 *  another church's contact. The insert simply selects zero rows.
 *
 *  Guard 2 — `ON CONFLICT … DO NOTHING` against the partial unique index
 *  erasure_record_subject_uq: it is impossible to mint a SECOND receipt for the
 *  same contact. A double-click's second run inserts nothing.
 *
 *  Both guards are inside one statement, so both are atomic under Postgres's
 *  per-statement implicit transaction — there is no window in which two receipts
 *  can exist. A pre-check ("does a record already exist?") would have been TOCTOU
 *  and is deliberately absent.
 *
 *  Returns null when zero rows were inserted. That is a MEANINGFUL ANSWER, not an
 *  error: the caller looks the existing record up and decides which of three
 *  things happened (already done / still pending / no such contact).
 *
 *  Raw SQL because drizzle cannot express INSERT … SELECT with a partial-index
 *  conflict target. Timestamps are absent here (all defaults), so the ISO-text
 *  convention in password-reset.ts does not apply. */
export async function openSubjectErasure(
  input: OpenSubjectErasureInput,
): Promise<{ id: string; createdAt: Date } | null> {
  const result = await db.execute(sql`
    insert into erasure_record
      (church_id, reason, status, subject_contact_id, subject_phone_hash,
       performed_by_email, messages_deleted, prayers_deleted, contacts_deleted)
    select ${input.churchId}::uuid, 'subject_request', 'pending', c.id, ${input.phoneHash},
           ${input.performedByEmail}, ${input.messages}, ${input.prayers}, 1
      from contact c
     where c.id = ${input.contactId}::uuid and c.church_id = ${input.churchId}::uuid
    on conflict ("church_id", "subject_contact_id") where reason = 'subject_request'
    do nothing
    returning id, created_at
  `);

  // Both drivers return { rows: [...] }; the shapes differ in everything else —
  // which is why created_at is typed `unknown` and goes through the guard rather
  // than being asserted into a Date the driver never promised.
  const rows = (result as unknown as { rows: Array<{ id: string; created_at: unknown }> }).rows;
  if (rows.length === 0) return null;
  return { id: rows[0].id, createdAt: receiptCreatedAt(rows[0].created_at, new Date()) };
}

/** A STATUS FLIP ONLY. Deliberately takes no counts.
 *
 *  The counts have been on the row since it was opened, taken from an observation
 *  immediately before the delete — the only moment they were obtainable, because
 *  a cascade appears in no rowcount. Letting completion write them would mean the
 *  nightly sweep had to invent numbers for a contact row that no longer exists,
 *  and a self-healed receipt reading "0 mensagens, 0 pedidos" for the one case
 *  where the delete definitely happened is worse than no receipt at all. */
export async function completeErasureRecord(recordId: string, churchId: string): Promise<void> {
  await db
    .update(erasureRecord)
    .set({ status: 'done', completedAt: new Date() })
    .where(and(eq(erasureRecord.id, recordId), eq(erasureRecord.churchId, churchId)));
}

export async function findErasureByContact(
  churchId: string,
  contactId: string,
): Promise<ErasureRecordRow | null> {
  const rows = await db
    .select(RECORD_COLUMNS)
    .from(erasureRecord)
    .where(and(
      eq(erasureRecord.churchId, churchId),
      eq(erasureRecord.subjectContactId, contactId),
      eq(erasureRecord.reason, 'subject_request'),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function findErasureByPhoneHash(
  churchId: string,
  hash: string,
): Promise<ErasureRecordRow | null> {
  const rows = await db
    .select(RECORD_COLUMNS)
    .from(erasureRecord)
    .where(and(eq(erasureRecord.churchId, churchId), eq(erasureRecord.subjectPhoneHash, hash)))
    .orderBy(desc(erasureRecord.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listErasureRecords(
  churchId: string,
  limit: number,
): Promise<ErasureRecordRow[]> {
  return db
    .select(RECORD_COLUMNS)
    .from(erasureRecord)
    .where(eq(erasureRecord.churchId, churchId))
    .orderBy(desc(erasureRecord.createdAt))
    .limit(limit);
}
