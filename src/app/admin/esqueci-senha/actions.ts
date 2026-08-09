'use server';

import { appBaseUrl } from '@/lib/app-url';
import {
  RESET_RESPONSE_FLOOR_MS,
  floorOverrunMs,
  generateResetToken,
  hashResetToken,
  remainingFloorMs,
  resetLinkFor,
  resetTokenExpiresAt,
} from '@/lib/auth/reset-token';
import { ConcurrencyGate } from '@/lib/concurrency-gate';
import { sendPasswordResetEmail } from '@/lib/email';
import { issueResetToken } from '@/lib/repo/password-reset';

export interface ForgotPasswordState {
  sent?: boolean;
  error?: string;
}

/** RFC 5321's maximum. Anything longer cannot be an address, so it never reaches
 *  the database — but it still gets the identical message and the identical
 *  elapsed time as everything else. */
const EMAIL_MAX = 254;

/** How many reset requests this serverless instance will work on at once.
 *
 *  THE PROBLEM IT ADDRESSES. This endpoint is unauthenticated, and every request
 *  that reaches it buys a database round trip and then a deliberate sleep to the
 *  response floor. The per-account throttle in issueResetToken caps EMAILS to one
 *  address per minute; it caps nothing for an address that belongs to nobody,
 *  which is every address an attacker makes up. So a flood of junk addresses is
 *  throttled by exactly nothing while pinning a paid function for the floor,
 *  apiece. That is an amplifier: cheap for the sender, billed to the church.
 *
 *  WHY A CONCURRENCY CAP RATHER THAN A RATE COUNTER. Counting requests per window
 *  means holding state that is meaningful across instances, and there is nowhere
 *  to put it — no Redis, no KV, and the database is the resource being protected.
 *  In-flight count needs no storage and no clock, and it is a direct measure of
 *  the thing being consumed: function-seconds. It also cannot misfire on ordinary
 *  use, because ordinary use is one secretary at a time and never has six
 *  requests overlapping.
 *
 *  WHY SHEDDING HERE IS NOT ITSELF AN ORACLE. The decision is taken before the
 *  submitted address is looked at, and depends only on how many requests are
 *  already in flight. Two requests arriving at the same moment get the same answer
 *  whether they name a registered address or a fictional one, so the fast refusal
 *  carries no information about any account. The visitor sees the one message this
 *  form ever shows.
 *
 *  Six, not one: a church with several staff and a slow connection can legitimately
 *  have a few requests overlapping, and shedding a real secretary's reset means she
 *  never gets her email. Six concurrent slots against a 400ms floor is ~15 requests
 *  a second per instance before anything is refused, which no real congregation
 *  will reach and a flood passes in milliseconds.
 *
 *  This is a mitigation, not the rate limiter this repo still lacks — see the
 *  ConcurrencyGate docblock for exactly what it does not cover. */
const MAX_CONCURRENT_RESET_REQUESTS = 6;
const resetRequests = new ConcurrencyGate(MAX_CONCURRENT_RESET_REQUESTS);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  // Trim only, never lowercase: the lookup inside issueResetToken matches the
  // column exactly, and login/actions.ts does the same. Normalising on one side of
  // that pair and not the other would produce an account nobody can log into or
  // nobody can recover.
  const email = String(formData.get('email') ?? '').trim();

  // Refusing a BLANK field is not an oracle — it says nothing about any account —
  // and silently answering "we sent it" to someone who submitted nothing would be
  // a lie with no upside. This returns before the floor because it does no lookup:
  // there is nothing here whose duration could leak. It is also free, so it is
  // decided before the gate rather than behind it.
  if (!email) return { error: 'Informe o seu e-mail.' };

  // Above the cap, refuse instantly and WITHOUT the floor. Sleeping here would
  // spend the exact resource the cap exists to protect.
  if (!resetRequests.tryAcquire()) return { sent: true };

  const startedAt = Date.now();
  try {
    try {
      if (email.length <= EMAIL_MAX) {
        const now = new Date();
        const token = generateResetToken();
        // ONE statement, for a known address and an unknown one alike — that is
        // what makes the two branches take the same time, not the floor below.
        // Only the hash is stored; the plaintext lives in this function's scope and
        // in the email, and nowhere else — least of all the database.
        const issued = await issueResetToken({
          email,
          tokenHash: hashResetToken(token),
          expiresAt: resetTokenExpiresAt(now),
          now,
        });
        // `created` is false when nobody has this address, and false when the
        // throttle refused. The response does not change in either case.
        if (issued.created && issued.email !== null) {
          await sendPasswordResetEmail(issued.email, resetLinkFor(appBaseUrl(), token));
        }
      }
    } catch (error) {
      // A database or provider failure must not become the difference between the
      // two branches. Logged for the operator, invisible to the visitor.
      console.error('[reset] request failed:', error);
    }

    const elapsed = Date.now() - startedAt;
    const overrun = floorOverrunMs(elapsed);
    if (overrun > 0) {
      // The alarm this code did not have. A branch running past the floor is how
      // the floor stops applying, and the previous version of this action reported
      // that condition by doing nothing observable at all for months. It is a
      // warning and not an error because the branches are equal in shape now — an
      // overrun means the padding stopped, not that the oracle is back — but it is
      // the signal to re-measure, and the first thing to suspect is a second round
      // trip having crept into the block above.
      console.warn(
        `[reset] request took ${elapsed}ms, ${overrun}ms past the ${RESET_RESPONSE_FLOOR_MS}ms response ` +
          'floor; re-measure before trusting the floor to hide the email send',
      );
    }
    await sleep(remainingFloorMs(elapsed));
    return { sent: true };
  } finally {
    // Released only after the sleep. The slot has to cover the whole time this
    // function is pinned, because that time is the cost being capped.
    resetRequests.release();
  }
}
