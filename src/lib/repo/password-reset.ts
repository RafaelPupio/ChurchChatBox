import { and, desc, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { passwordResetToken } from '@/db/schema';
import { mayRequestNewToken } from '@/lib/auth/reset-token';

/** Reset tokens are keyed by admin identity, not by church — see the schema
 *  comment on password_reset_token. Nothing in this file takes a churchId,
 *  because nothing in this file is reachable with a church context: the caller is
 *  an anonymous visitor holding a 256-bit secret. The church comes from the
 *  admin_user row the token points at.
 *
 *  neon-http has no transactions, so every function here is explicit about which
 *  of its statements carries a correctness guarantee and which does not. */

/** Deletes the tokens for this admin that can no longer do anything: already
 *  consumed, or past their expiry. Housekeeping only — nothing depends on it
 *  having run, because both consumption and the throttle re-check used_at and
 *  expires_at themselves. Without it the table grows without bound. */
async function purgeDeadTokens(adminUserId: string, now: Date): Promise<void> {
  await db
    .delete(passwordResetToken)
    .where(
      and(
        eq(passwordResetToken.adminUserId, adminUserId),
        or(isNotNull(passwordResetToken.usedAt), lt(passwordResetToken.expiresAt, now)),
      ),
    );
}

/** Mints one reset token for an admin, unless that admin asked too recently.
 *
 *  Returns whether a token was actually stored, so the caller knows whether to
 *  send mail. The caller must NOT vary its response on this value: a throttled
 *  request has to look exactly like a delivered one, or the throttle becomes the
 *  account-existence oracle the whole flow is built to avoid.
 *
 *  THE THROTTLE IS BEST-EFFORT AND THIS IS DELIBERATE. It is three statements and
 *  they are not atomic together, so two requests racing for the same address can
 *  both see "nothing recent" and both insert. Making it a single
 *  `INSERT ... SELECT ... WHERE NOT EXISTS` would not fix that either: under READ
 *  COMMITTED each statement's subquery reads a snapshot taken before the other's
 *  insert, so a concurrent burst defeats that form too. Only a real rate limiter
 *  in front of the endpoint stops a burst, and this repo has none (see the
 *  report). What this does stop is the sequential case — a script looping on one
 *  address — which is the difference between "one message a minute" and "as many
 *  as the attacker can issue".
 *
 *  Losing that race costs one extra email. That is why best-effort is acceptable
 *  HERE and is not acceptable in consumeResetToken below, where losing the race
 *  would mean one token spending twice. */
export async function createResetToken(input: {
  adminUserId: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}): Promise<boolean> {
  await purgeDeadTokens(input.adminUserId, input.now);

  const recent = await db
    .select({ createdAt: passwordResetToken.createdAt })
    .from(passwordResetToken)
    .where(
      and(
        eq(passwordResetToken.adminUserId, input.adminUserId),
        isNull(passwordResetToken.usedAt),
        gt(passwordResetToken.expiresAt, input.now),
      ),
    )
    .orderBy(desc(passwordResetToken.createdAt))
    .limit(1);

  if (!mayRequestNewToken(recent[0]?.createdAt ?? null, input.now)) return false;

  await db.insert(passwordResetToken).values({
    adminUserId: input.adminUserId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    createdAt: input.now,
  });
  return true;
}

/** Claims a token, atomically, and returns the admin it belongs to — or null if
 *  the token is unknown, already spent, or expired.
 *
 *  THIS IS ONE STATEMENT AND IT HAS TO BE. Single use is a security property: the
 *  read ("is it still unused?") and the write ("mark it used") cannot be two
 *  statements on a driver with no transactions, because two requests carrying the
 *  same token would both read `used_at IS NULL` before either wrote, and both
 *  would go on to set a password. A conditional `UPDATE ... WHERE used_at IS NULL
 *  ... RETURNING` collapses both into one: Postgres takes a row lock, the loser
 *  blocks, and on unblocking it re-evaluates its WHERE against the committed row,
 *  sees used_at set, and matches nothing. Exactly one caller gets an id back.
 *
 *  Expiry is checked here as well as by the pure predicate in reset-token.ts, and
 *  it is checked against `now` passed in rather than the database clock so the
 *  rule has one owner. The two must keep agreeing — tests assert both. */
export async function consumeResetToken(tokenHash: string, now: Date): Promise<string | null> {
  const claimed = await db
    .update(passwordResetToken)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetToken.tokenHash, tokenHash),
        isNull(passwordResetToken.usedAt),
        gt(passwordResetToken.expiresAt, now),
      ),
    )
    .returning({ adminUserId: passwordResetToken.adminUserId });

  return claimed[0]?.adminUserId ?? null;
}

/** Destroys every outstanding reset link for an admin.
 *
 *  Called by both the reset flow and change-your-own-password, and in both cases
 *  it is called BEFORE the new password hash is written. That ordering is forced
 *  by the lack of transactions, and it is the fail-safe direction:
 *
 *    delete-then-write, interrupted → no live links, password unchanged. The user
 *      requests a new link. Annoying, safe.
 *    write-then-delete, interrupted → password changed, and somebody else's
 *      outstanding link still works for up to an hour. That is precisely the hole
 *      "a reset invalidates every other token" exists to close.
 *
 *  Deletes rather than marking used: nothing needs the audit trail, and a row
 *  that is gone cannot be resurrected by a bug in a WHERE clause. */
export async function invalidateResetTokensFor(adminUserId: string): Promise<void> {
  await db.delete(passwordResetToken).where(eq(passwordResetToken.adminUserId, adminUserId));
}

/** Test/diagnostic read. Not used by the application. */
export async function listResetTokensFor(adminUserId: string) {
  return db
    .select()
    .from(passwordResetToken)
    .where(eq(passwordResetToken.adminUserId, adminUserId))
    .orderBy(desc(passwordResetToken.createdAt));
}
