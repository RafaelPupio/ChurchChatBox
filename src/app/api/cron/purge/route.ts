import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { retentionCutoff } from '@/lib/retention';
import { deleteMember } from '@/lib/repo/member-data';
import {
  addRetentionCounts,
  completeErasureRecordSystem,
  hasPurgeWork,
  listChurchIdsForPurge,
  listStalePendingErasures,
  markChurchPurged,
  openRetentionRecord,
  purgeContactBatch,
  purgeMessageBatch,
  purgePrayerBatch,
  sweepStaleRetentionRecords,
} from '@/lib/repo/retention';

/** The nightly retention purge. THE ONLY FILE PERMITTED TO IMPORT
 *  @/lib/repo/retention — see tests/privilege-boundary.test.ts.
 *
 *  Operator-facing: responses and logs stay in English, like the CLI scripts.
 *  No user-facing string is produced here. */

// Vercel Cron issues a GET. There is deliberately no POST export.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Overall wall clock. Sits under maxDuration with room to write the last
 *  receipt and return. */
const RUN_BUDGET_MS = 45_000;
/** No single church may eat the whole run. */
const CHURCH_BUDGET_MS = 10_000;
const MAX_BATCHES_PER_TABLE = 20;
const BATCH_SIZE = 500;
const MAX_CHURCHES_PER_RUN = 200;

/** Retention rows still pending after this are frozen at whatever counts they
 *  carry. Long enough that a slow-but-alive run is never swept out from under
 *  itself. */
const STALE_RETENTION_MS = 6 * 60 * 60 * 1000;
/** Subject erasures are a single member and take seconds; 15 minutes pending
 *  means the run that opened the receipt died. */
const STALE_ERASURE_MS = 15 * 60 * 1000;

function authorised(request: Request): 'ok' | 'unset' | 'denied' {
  const secret = process.env.CRON_SECRET;
  // FAILS CLOSED. This is the one guard in the codebase that does.
  if (!secret) return 'unset';

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  // Length must be compared first: timingSafeEqual throws on a length mismatch.
  // Comparing lengths leaks only the secret's length, which is not the secret.
  if (a.length !== b.length) return 'denied';
  return timingSafeEqual(a, b) ? 'ok' : 'denied';
}

export async function GET(request: Request): Promise<Response> {
  const auth = authorised(request);
  if (auth === 'unset') {
    console.error('[cron/purge] CRON_SECRET is not set — refusing to run. An unauthenticated purge endpoint is a public delete button.');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (auth === 'denied') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const cutoff = retentionCutoff(now);
  const summary = { churchesVisited: 0, churchesPurged: 0, messages: 0, prayers: 0, contacts: 0, erasuresCompleted: 0, retentionSwept: 0 };

  // --- Sweeps first: they are cheap, bounded, and they heal receipts from a run
  //     that died. Doing them before the budget is spent means an interrupted
  //     erasure is completed even on a night when the purge itself runs long.
  try {
    const stale = await listStalePendingErasures(new Date(now.getTime() - STALE_ERASURE_MS));
    for (const rec of stale) {
      // Idempotent: zero rows if the delete already succeeded. What the record
      // asserts — this contact's data is not in the database — becomes true either
      // way, and no counts are written because they were set at open time.
      if (rec.subjectContactId) await deleteMember(rec.churchId, rec.subjectContactId);
      await completeErasureRecordSystem(rec.id);
      summary.erasuresCompleted += 1;
    }
    summary.retentionSwept = await sweepStaleRetentionRecords(
      new Date(now.getTime() - STALE_RETENTION_MS),
    );
  } catch (error) {
    console.error('[cron/purge] sweep failed', error);
  }

  // --- The rotation. Least-recently-purged first; the cursor advances when a
  //     slice ENDS, finished or not.
  let churchIds: string[] = [];
  try {
    churchIds = await listChurchIdsForPurge(MAX_CHURCHES_PER_RUN);
  } catch (error) {
    console.error('[cron/purge] could not list churches', error);
    return NextResponse.json({ error: 'church list failed' }, { status: 500 });
  }

  for (const churchId of churchIds) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) break;
    summary.churchesVisited += 1;

    try {
      // Probe: no work → advance the cursor and write NO record. This is what
      // keeps "a retention row means something was actually deleted" true while
      // still writing the row before the deletes.
      if (!(await hasPurgeWork(churchId, cutoff))) {
        await markChurchPurged(churchId, new Date());
        continue;
      }

      const recordId = await openRetentionRecord(churchId);
      summary.churchesPurged += 1;
      const sliceStart = Date.now();
      const withinSlice = () =>
        Date.now() - sliceStart < CHURCH_BUDGET_MS && Date.now() - startedAt < RUN_BUDGET_MS;

      // CHILDREN FIRST. Both arms of each predicate include rows belonging to
      // contacts about to be purged, so step 3's cascade can never fire.
      for (const [key, purge] of [
        ['messages', purgeMessageBatch],
        ['prayers', purgePrayerBatch],
      ] as const) {
        let batches = 0;
        while (withinSlice() && batches < MAX_BATCHES_PER_TABLE) {
          const n = await purge(churchId, cutoff, BATCH_SIZE);
          if (n === 0) break;
          batches += 1;
          summary[key] += n;
          // Committed AFTER the delete that earned it. This is why the receipt
          // never OVERSTATES: it can lag by at most one batch, never lead.
          await addRetentionCounts(recordId, churchId, {
            messages: key === 'messages' ? n : 0,
            prayers: key === 'prayers' ? n : 0,
            contacts: 0,
          });
          if (n < BATCH_SIZE) break;
        }
      }

      // GUARDED PARENT LAST.
      let batches = 0;
      while (withinSlice() && batches < MAX_BATCHES_PER_TABLE) {
        const n = await purgeContactBatch(churchId, cutoff, BATCH_SIZE);
        if (n === 0) break;
        batches += 1;
        summary.contacts += n;
        await addRetentionCounts(recordId, churchId, { messages: 0, prayers: 0, contacts: n });
        if (n < BATCH_SIZE) break;
      }

      await completeErasureRecordSystem(recordId);
    } catch (error) {
      // One church's failure must not end the run for every other church.
      console.error(`[cron/purge] church ${churchId} failed`, error);
    }

    // Advanced whether or not the slice finished — that is what makes the
    // rotation a rotation rather than a queue one big church can starve.
    try {
      await markChurchPurged(churchId, new Date());
    } catch (error) {
      console.error(`[cron/purge] could not advance cursor for ${churchId}`, error);
    }
  }

  console.log('[cron/purge]', JSON.stringify({ ...summary, ms: Date.now() - startedAt }));
  return NextResponse.json({ ok: true, ...summary });
}
