import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { passwordResetToken } from '@/db/schema';
import { resetRequestCutoff } from '@/lib/auth/reset-token';

/** Reset tokens are keyed by admin identity, not by church — see the schema
 *  comment on password_reset_token. Nothing in this file takes a churchId,
 *  because nothing in this file is reachable with a church context: the caller is
 *  an anonymous visitor holding a 256-bit secret. The church comes from the
 *  admin_user row the token points at.
 *
 *  neon-http has no transactions, so every function here is explicit about which
 *  of its statements carries a correctness guarantee and which does not. */

export interface IssuedResetToken {
  /** The address as it is stored on the admin row, or null when no admin has this
   *  address. The caller sends mail to THIS value rather than to what was typed,
   *  so a future change to how addresses are matched cannot turn into mail
   *  addressed somewhere other than the account it belongs to. */
  email: string | null;
  /** Whether a token row was actually written. False when the address belongs to
   *  nobody, and false when the per-account throttle refused. */
  created: boolean;
}

/** Finds the admin with this address, clears their dead tokens, applies the
 *  per-account throttle, and mints a token — IN ONE STATEMENT, which is the whole
 *  point of the function.
 *
 *  WHY ONE STATEMENT. neon-http sends every statement as its own HTTPS request,
 *  measured at a 177ms median against this project's database (the full table is
 *  in reset-token.ts). As four statements this cost 713.2ms at the median, while
 *  an address belonging to nobody cost 177.6ms because nothing at all ran for it.
 *  That difference is not a performance note: the caller is a PUBLIC form, and the
 *  gap was wider than the response floor meant to hide it, so the form answered
 *  "this address administers a church" to anyone with a stopwatch. Round trips are
 *  the unit of cost, so the fix is to make both branches cost exactly one — for a
 *  known address and an unknown one alike, since the lookup is now inside the
 *  statement rather than in front of it. Measured after: p50 178.4ms known against
 *  178.3ms unknown, p99 269.6ms against 265.2ms.
 *
 *  WHY RAW SQL. Drizzle's builder has no way to express a data-modifying CTE, and
 *  this needs three of them. The identifiers are written out; the values are all
 *  bound parameters. Everything this statement does is exercised against real
 *  Postgres in tests/password-reset.test.ts running the real migrations, which is
 *  what would catch a column renamed out from under this text.
 *
 *  WHY THE PURGE AND THE THROTTLE DO NOT COLLIDE, now that they share a snapshot
 *  rather than running one after the other: `purged` takes rows where
 *  `used_at IS NOT NULL OR expires_at < now` and `live` counts rows where
 *  `used_at IS NULL AND expires_at > now`. No row satisfies both, so `live` sees
 *  the same set whether or not it can see the delete. (The boundary row, unused
 *  and expiring at exactly `now`, belongs to neither — as it did before.)
 *
 *  THE THROTTLE IS STILL BEST-EFFORT, and being one statement does not change
 *  that. Under READ COMMITTED, two concurrent requests for the same address each
 *  read a snapshot taken before the other's insert, so both can find "nothing
 *  live" and both can insert. Only a limiter in front of the endpoint stops a
 *  burst. What this does stop is the sequential case — a script looping on one
 *  address — which is the difference between one message a minute and as many as
 *  the attacker can issue. Losing that race costs one extra email, which is why
 *  best-effort is acceptable HERE and is not acceptable in consumeResetToken
 *  below, where losing the race would mean one token spending twice. */
export async function issueResetToken(input: {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}): Promise<IssuedResetToken> {
  // Timestamps go as ISO text with an explicit cast rather than as Date objects,
  // so the statement means the same thing on neon-http and on the PGlite the tests
  // run against instead of depending on how each driver encodes a Date.
  const now = input.now.toISOString();
  const cutoff = resetRequestCutoff(input.now).toISOString();
  const expiresAt = input.expiresAt.toISOString();

  const result = await db.execute(sql`
    with target as (
      select id, email from admin_user where email = ${input.email} limit 1
    ), purged as (
      delete from password_reset_token t using target
       where t.admin_user_id = target.id
         and (t.used_at is not null or t.expires_at < ${now}::timestamptz)
      returning 1
    ), live as (
      select max(t.created_at) as last_created
        from password_reset_token t
        join target on t.admin_user_id = target.id
       where t.used_at is null and t.expires_at > ${now}::timestamptz
    ), inserted as (
      insert into password_reset_token (admin_user_id, token_hash, expires_at, created_at)
      select target.id, ${input.tokenHash}, ${expiresAt}::timestamptz, ${now}::timestamptz
        from target, live
       where live.last_created is null or live.last_created <= ${cutoff}::timestamptz
      returning admin_user_id
    )
    select (select email from target) as email,
           (select count(*) from inserted)::int as created,
           (select count(*) from purged)::int as purged
  `);

  // Both drivers return { rows: [...] }; the shapes differ in everything else.
  const rows = (result as unknown as { rows: Array<{ email: string | null; created: number }> }).rows;
  const row = rows[0];
  return { email: row?.email ?? null, created: Number(row?.created ?? 0) > 0 };
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
