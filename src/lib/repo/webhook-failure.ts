import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { webhookFailure } from '@/db/schema';
import { FAILURE_WINDOW_MS, toFailureReason } from '@/lib/webhook-failure';

/** The WRITE half of the failure alarm, and the only half the webhook may touch.
 *
 *  Church-facing on purpose: it records one row about one request, for the church
 *  that request belonged to (or none). It reads nothing, spans nothing, and so it
 *  is not owner-only — unlike the cross-church READ, which lives in
 *  src/lib/repo/platform.ts and is kept out of here by
 *  tests/privilege-boundary.test.ts. The webhook must never learn to see other
 *  tenants just because it learned to complain. */

/**
 * Record that the webhook's catch block fired. NEVER REJECTS, EVER.
 *
 * This runs inside the catch of a handler whose one rule is ALWAYS RETURN 200,
 * because a non-200 makes Meta retry and a retry means a real person is answered
 * twice. An alarm that can throw would turn a silent bot into a duplicate-message
 * bot — it would be worse than no alarm at all. So every failure of the recording
 * itself dies here, in a console.error, which is where it started.
 *
 * `churchId` is null whenever the request failed before a church was identified —
 * which is not a rare edge: the 2026-08-10 outage failed IN the church lookup, so
 * null is what that day would have written, every time.
 *
 * ONE ROW PER (church, reason). A church broken this way fails once per inbound
 * message; the upsert increments a counter instead of appending, so a whole
 * Sunday of a dead webhook is one row saying "1.482 falhas" rather than 1.482
 * rows saying the same sentence. The count restarts once the previous failure of
 * the same kind is older than FAILURE_WINDOW_MS, so the number means "this
 * incident" and never silently accumulates across months.
 */
export async function recordWebhookFailure(
  churchId: string | null,
  error: unknown,
  now: Date = new Date(),
): Promise<void> {
  try {
    // Inside the try, not above it. toFailureReason is total today; keeping the
    // call in here means no future edit to it can escape this function's promise
    // never to reject.
    const reason = toFailureReason(error);
    // A literal cast rather than a bound Date, so the comparison means the same
    // thing under neon-http and under PGlite instead of depending on how each
    // driver happens to serialise a Date inside a raw fragment.
    const incidentStart = sql`${new Date(now.getTime() - FAILURE_WINDOW_MS).toISOString()}::timestamptz`;
    const isNewIncident = sql`${webhookFailure.lastSeenAt} < ${incidentStart}`;

    await db
      .insert(webhookFailure)
      .values({ churchId, reason, failureCount: 1, firstSeenAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        // Matches webhook_failure_church_reason_uq, which is NULLS NOT DISTINCT —
        // without that, every church_id-less failure would insert its own row.
        target: [webhookFailure.churchId, webhookFailure.reason],
        set: {
          failureCount: sql`case when ${isNewIncident} then 1 else ${webhookFailure.failureCount} + 1 end`,
          firstSeenAt: sql`case when ${isNewIncident} then ${now.toISOString()}::timestamptz else ${webhookFailure.firstSeenAt} end`,
          lastSeenAt: now,
        },
      });
  } catch (recordingError) {
    // The alarm's own failure. Nowhere else to put it: writing it to the database
    // is what just failed, and this must not propagate.
    console.error('Could not record webhook failure', recordingError);
  }
}
