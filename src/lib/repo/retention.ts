import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { church, erasureRecord } from '@/db/schema';

/** ⚠ SYSTEM-ONLY, CROSS-CHURCH BY CONSTRUCTION. ⚠
 *
 *  Every query in this file deliberately spans churches — that is its
 *  specification, not a defect. It exists so the nightly retention purge can walk
 *  the whole platform, which no church-facing code has any business doing.
 *
 *  IMPORTABLE BY EXACTLY ONE FILE: src/app/api/cron/purge/route.ts.
 *  tests/privilege-boundary.test.ts enforces that as an importer-keyed rule, and
 *  this module is itself SCANNED — so it may not import platform.ts either. If you
 *  need one of these functions somewhere else, you almost certainly want a
 *  church-scoped equivalent in repo/member-data.ts instead.
 *
 *  Timestamps in raw SQL go as ISO text with an explicit ::timestamptz cast, so a
 *  statement means the same thing on neon-http and on the PGlite the tests run
 *  against, rather than depending on how each driver encodes a Date. Same
 *  convention as src/lib/repo/password-reset.ts. */

/** Least-recently-purged first, never-purged at the front.
 *
 *  This ordering plus a per-church slice cap is the whole fairness mechanism.
 *  With an unordered list and a flat global budget, the tail of a 40-church list
 *  could go weeks unpurged with nothing in the product saying so. */
export async function listChurchIdsForPurge(limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: church.id })
    .from(church)
    .orderBy(sql`${church.retentionPurgedAt} asc nulls first`, asc(church.id))
    .limit(limit);
  return rows.map((r) => r.id);
}

/** Advanced when a church's slice ENDS, whether or not that church finished. That
 *  is what makes the rotation a rotation: a church with a million rows takes its
 *  slice, moves to the back of the queue, and the rest of the platform gets
 *  purged tomorrow instead of never. */
export async function markChurchPurged(churchId: string, at: Date): Promise<void> {
  await db.update(church).set({ retentionPurgedAt: at }).where(eq(church.id, churchId));
}

/** What a raw `exists(...)` actually gives back, made into the boolean the
 *  interface promises — and, where it cannot be recognised, made into the SAFE
 *  boolean rather than the plausible one.
 *
 *  PGlite returns a real JS `true`. neon-http is unverified from here (this repo
 *  can exercise PGlite and nothing else), and Postgres's own wire representation of
 *  a boolean is the text 't'/'f', so a driver that skipped the bool parser would
 *  hand back a STRING. Note that BOTH naive readings break on that string, in
 *  opposite directions: `'f' === true` is false, which happens to be right, while
 *  `'f'` under a truthiness test is TRUE, which is wrong. A value whose type is not
 *  known cannot be read by either.
 *
 *  THE DIRECTION OF THE GUESS IS THE WHOLE POINT, and it is not symmetric:
 *
 *   - Guessing FALSE wrongly: the cron advances the cursor, writes no record and
 *     moves on — every night, for that church, forever, because the next run reads
 *     the same shape and makes the same guess. Its members' messages and prayer
 *     requests live past 12 months, nothing in the product says so, and neither the
 *     church nor the vendor has anything to notice. That is the statutory failure
 *     this entire subsystem exists to prevent, arriving silently.
 *   - Guessing TRUE wrongly: a retention receipt is opened, the three purge loops
 *     find nothing past the cutoff and delete nothing, and the church sees a done
 *     receipt reading "0 mensagens, 0 pedidos de oração, 0 cadastros". That is
 *     noise on a page a secretary reads — and it is LOUD. An all-zero receipt is
 *     the exact shape a human notices and asks about.
 *
 *  So only a value positively recognised as "no work" returns false. An unknown
 *  type, a missing column, a missing row — all return true and log. Doing
 *  unnecessary work noisily beats skipping necessary work silently, and the noisy
 *  version is also the one that gets reported and fixed.
 *
 *  Exported ONLY so these shapes can be tested; hasPurgeWork is its one caller. */
export function interpretWorkFlag(churchId: string, value: unknown): boolean {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 't' || v === 'true') return true;
    if (v === 'f' || v === 'false') return false;
  }
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  // Operator-facing and English, like every console line in this codebase (C1).
  // The value is the result of an `exists()` — a single scalar about whether ANY
  // row is old, carrying nothing about any member — so logging it is not a C6
  // problem, and its type is what actually identifies the driver defect.
  console.error('[retention] unrecognised hasPurgeWork result; assuming work exists', {
    churchId,
    type: typeof value,
    value,
  });
  return true;
}

/** One statement, one round trip: does this church have anything to purge at all?
 *
 *  False → advance the cursor, write NO record, move on. This is what keeps "a
 *  retention row means something was actually deleted" true while still writing
 *  the row BEFORE the deletes — and it is also why a WRONG false is so expensive,
 *  which is what interpretWorkFlag above is about. */
export async function hasPurgeWork(churchId: string, cutoff: Date): Promise<boolean> {
  const iso = cutoff.toISOString();
  const result = await db.execute(sql`
    select
      exists(select 1 from message         where church_id = ${churchId}::uuid and created_at < ${iso}::timestamptz)
      or exists(select 1 from prayer_request where church_id = ${churchId}::uuid and created_at < ${iso}::timestamptz)
      or exists(select 1 from contact        where church_id = ${churchId}::uuid
                 and coalesce(last_inbound_at, created_at) < ${iso}::timestamptz) as work
  `);
  // Both drivers return { rows: [...] }; the shapes differ in everything else.
  // `unknown` rather than `boolean` because asserting the type here is exactly the
  // lie platform.ts's `sql<Date>` told. An empty rows array reaches the guard as
  // undefined and takes the same safe branch as a wrong type.
  const rows = (result as unknown as { rows: Array<{ work: unknown }> }).rows;
  return interpretWorkFlag(churchId, rows[0]?.work);
}

export async function openRetentionRecord(churchId: string): Promise<string> {
  const [row] = await db
    .insert(erasureRecord)
    .values({ churchId, reason: 'retention', status: 'pending' })
    .returning({ id: erasureRecord.id });
  return row.id;
}

export interface PurgeDelta {
  messages: number;
  prayers: number;
  contacts: number;
}

/** Names ALL THREE counters. Loops 1–3 delete messages, prayer requests AND
 *  contacts; an implementation incrementing messages alone would leave every
 *  receipt reading "0 pedidos de oração, 0 cadastros apagados" forever and fire
 *  the interrupted-run string on runs that completed normally. A batch that
 *  deleted only messages passes 0 for the other two. */
export async function addRetentionCounts(
  recordId: string,
  churchId: string,
  delta: PurgeDelta,
): Promise<void> {
  await db
    .update(erasureRecord)
    .set({
      messagesDeleted: sql`${erasureRecord.messagesDeleted} + ${delta.messages}`,
      prayersDeleted: sql`${erasureRecord.prayersDeleted} + ${delta.prayers}`,
      contactsDeleted: sql`${erasureRecord.contactsDeleted} + ${delta.contacts}`,
    })
    .where(and(eq(erasureRecord.id, recordId), eq(erasureRecord.churchId, churchId)));
}

/** STEP 1 — messages. Everything past the cutoff, PLUS everything belonging to a
 *  contact that is about to be purged. The second arm is what stops those rows
 *  from being taken invisibly by a cascade in step 3. */
export async function purgeMessageBatch(
  churchId: string,
  cutoff: Date,
  limit: number,
): Promise<number> {
  const iso = cutoff.toISOString();
  const result = await db.execute(sql`
    delete from message
     where id in (
       select id from message
        where church_id = ${churchId}::uuid
          and (created_at < ${iso}::timestamptz
               or contact_id in (select id from contact
                                  where church_id = ${churchId}::uuid
                                    and coalesce(last_inbound_at, created_at) < ${iso}::timestamptz))
        limit ${limit})
    returning id
  `);
  return (result as unknown as { rows: unknown[] }).rows.length;
}

/** STEP 2 — prayer requests. Same shape, same predicate pair. No exemption: the
 *  argument for keeping the most sensitive column longest is the same argument
 *  for keeping it least. */
export async function purgePrayerBatch(
  churchId: string,
  cutoff: Date,
  limit: number,
): Promise<number> {
  const iso = cutoff.toISOString();
  const result = await db.execute(sql`
    delete from prayer_request
     where id in (
       select id from prayer_request
        where church_id = ${churchId}::uuid
          and (created_at < ${iso}::timestamptz
               or contact_id in (select id from contact
                                  where church_id = ${churchId}::uuid
                                    and coalesce(last_inbound_at, created_at) < ${iso}::timestamptz))
        limit ${limit})
    returning id
  `);
  return (result as unknown as { rows: unknown[] }).rows.length;
}

/** STEP 3 — contacts, and ONLY those that provably own nothing.
 *
 *  The NOT EXISTS pair turns "the cascade *should* have nothing left" into "the
 *  cascade *cannot* fire". A member who writes between step 1 and step 3 — the
 *  webhook inserts the message one statement before it touches last_inbound_at,
 *  so their contact still matches the idle predicate for a moment — simply fails
 *  the guard and survives to the next run. Their new message is not silently
 *  cascaded away and the counts do not drift.
 *
 *  m.church_id / p.church_id inside the guards are LOAD-BEARING. Without them the
 *  guard is still correct (contact_id is a UUID primary key) but no longer
 *  seekable: message_contact_keyset_idx leads with church_id, and a predicate
 *  constraining only the second column cannot be used as an index seek. */
export async function purgeContactBatch(
  churchId: string,
  cutoff: Date,
  limit: number,
): Promise<number> {
  const iso = cutoff.toISOString();
  const result = await db.execute(sql`
    delete from contact
     where id in (
       select c.id from contact c
        where c.church_id = ${churchId}::uuid
          and coalesce(c.last_inbound_at, c.created_at) < ${iso}::timestamptz
          and not exists (select 1 from message m
                           where m.church_id = ${churchId}::uuid and m.contact_id = c.id)
          and not exists (select 1 from prayer_request p
                           where p.church_id = ${churchId}::uuid and p.contact_id = c.id)
        limit ${limit})
    returning id
  `);
  return (result as unknown as { rows: unknown[] }).rows.length;
}

/** System-privilege completion: no churchId, because the sweep walks every church.
 *  A status flip only — never writes counts, for the same reason
 *  completeErasureRecord does not. */
export async function completeErasureRecordSystem(recordId: string): Promise<void> {
  await db
    .update(erasureRecord)
    .set({ status: 'done', completedAt: new Date() })
    .where(eq(erasureRecord.id, recordId));
}

/** Retention rows still pending after the window are frozen at whatever counts
 *  they carry — up to and including 0/0/0. The sweep never invents a number and
 *  never attributes further deletion to the row. An all-zero done row is a real,
 *  reachable state, and Configurações LISTS it with an explanatory suffix rather
 *  than hiding it: hiding it is how 500 destroyed message bodies produce no
 *  visible line at all. */
export async function sweepStaleRetentionRecords(olderThan: Date): Promise<number> {
  const swept = await db
    .update(erasureRecord)
    .set({ status: 'done', completedAt: new Date() })
    .where(and(
      eq(erasureRecord.reason, 'retention'),
      eq(erasureRecord.status, 'pending'),
      lt(erasureRecord.createdAt, olderThan),
    ))
    .returning({ id: erasureRecord.id });
  return swept.length;
}

export interface StalePendingErasure {
  id: string;
  churchId: string;
  subjectContactId: string | null;
}

/** Subject-request receipts whose delete never completed. The caller re-runs the
 *  delete (idempotent, zero rows if it already succeeded) and then marks the
 *  record done. This is what makes the pending-first ordering safe: an interrupted
 *  erasure completes itself without anyone noticing it broke. */
export async function listStalePendingErasures(olderThan: Date): Promise<StalePendingErasure[]> {
  return db
    .select({
      id: erasureRecord.id,
      churchId: erasureRecord.churchId,
      subjectContactId: erasureRecord.subjectContactId,
    })
    .from(erasureRecord)
    .where(and(
      eq(erasureRecord.reason, 'subject_request'),
      eq(erasureRecord.status, 'pending'),
      lt(erasureRecord.createdAt, olderThan),
    ));
}
