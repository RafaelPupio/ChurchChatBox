import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** How long a reset link stays usable: one hour.
 *
 *  The link is a live credential sitting in a mailbox, so the window is a
 *  straight trade between "how long is a working key left lying around" and "can
 *  a volunteer who is not at a computer actually use it".
 *
 *  Shorter (15 min) was rejected: the person this feature exists for is a church
 *  volunteer on a phone, who may request the link, be interrupted by the thing
 *  she was doing, and come back. Making her request a second link — and then
 *  possibly hit the per-account throttle below — turns a recovery flow into a
 *  dead end for exactly the least technical user.
 *
 *  Longer (24h, a common default) was rejected because the realistic threat here
 *  is not a remote attacker guessing a 256-bit token; it is the shared computer in
 *  the church secretariat with somebody's webmail left open, and a link that
 *  survives overnight is a link that is still working when the next person sits
 *  down. One hour is short enough that the exposure is bounded by a single
 *  visit, and long enough to survive an interruption. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** The smallest gap between two reset links for the SAME account.
 *
 *  This repo has no rate limiting of any kind (see the report), and a public
 *  endpoint that sends mail is a way to flood a third party's inbox and burn an
 *  email quota. This is not a rate limiter — it is a per-account throttle that
 *  needs no infrastructure, because it is a predicate on rows this feature is
 *  already writing. It caps one address at ~60 messages an hour instead of as
 *  many as an attacker can issue requests.
 *
 *  It does NOT bound total requests, and deliberately does not change the
 *  response: a throttled request looks exactly like a delivered one, or the
 *  throttle would itself become the account-existence oracle the flow is built
 *  to avoid. */
export const RESET_REQUEST_MIN_INTERVAL_MS = 60 * 1000;

/** Number of random bytes in a token: 256 bits. */
const TOKEN_BYTES = 32;

/** A fresh reset token, in the form that goes in the emailed link.
 *
 *  crypto.randomBytes is a CSPRNG. A UUID is the wrong tool twice over: v4 carries
 *  122 bits rather than 256 because six bits are spent on version and variant
 *  markers, and — the part that actually bites — "generate a UUID" says nothing
 *  about the source of randomness, so the next refactor to a convenient helper
 *  can silently land on a Math.random-backed implementation. This function's
 *  security property is visible in its own body.
 *
 *  base64url so the value is safe in a URL with no percent-encoding. */
export function generateResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** What actually goes in the database.
 *
 *  SHA-256, NOT bcrypt, and that difference is deliberate rather than an
 *  inconsistency with src/lib/auth/password.ts:
 *
 *  1. bcrypt's cost factor buys resistance to offline brute force of a LOW-entropy
 *     secret. A human picks "igreja2024" out of a space a GPU can walk; nobody
 *     picks a 256-bit CSPRNG value, and there is no dictionary for one. Slowing
 *     the hash defends against an attack that cannot be mounted.
 *  2. bcrypt is salted, so equal inputs give different digests and a stored bcrypt
 *     hash cannot be looked up by index. Consuming a token would mean SELECTing
 *     every unexpired row and bcrypt-comparing each one — O(n) deliberately-slow
 *     hashes per request, which is a denial-of-service lever, and worse, it could
 *     not be expressed as the single atomic `UPDATE ... WHERE token_hash = $1`
 *     that gives single-use its atomicity on a driver with no transactions.
 *  3. bcrypt truncates its input at 72 bytes. A base64url token is 43 characters
 *     today; a future longer token would silently stop contributing entropy.
 *
 *  The property that matters — a database leak yields no usable link — holds
 *  either way, because SHA-256 of a 256-bit random value is not invertible. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two token hashes.
 *
 *  The database lookup is by indexed equality and is not constant time, which is
 *  fine — an index probe leaks nothing without the preimage. This exists for the
 *  in-process comparisons (tests, and any future code path that compares a
 *  supplied hash to a stored one) so that a `===` never creeps in. */
export function resetTokenHashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself be a signal.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** When a token minted at `now` stops working. */
export function resetTokenExpiresAt(now: Date): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS);
}

export interface ResetTokenState {
  expiresAt: Date;
  usedAt: Date | null;
}

/** The single-use + expiry predicate, as a pure function.
 *
 *  The database enforces this for real, inside the atomic consuming UPDATE — this
 *  is the same rule stated where it can be tested directly, and is what the repo
 *  layer's WHERE clause must keep agreeing with. Expiry is exclusive at the
 *  boundary: a token is dead the instant the clock reaches expiresAt. */
export function isResetTokenUsable(token: ResetTokenState, now: Date): boolean {
  if (token.usedAt !== null) return false;
  return now.getTime() < token.expiresAt.getTime();
}

/** Whether a new link may be minted for an account whose most recent unused link
 *  was created at `lastRequestedAt` (null when there is none). */
export function mayRequestNewToken(lastRequestedAt: Date | null, now: Date): boolean {
  if (lastRequestedAt === null) return true;
  return now.getTime() - lastRequestedAt.getTime() >= RESET_REQUEST_MIN_INTERVAL_MS;
}

/** The absolute link that goes in the email. Kept pure so the URL shape is
 *  testable without a request context. */
export function resetLinkFor(baseUrl: string, token: string): string {
  // Trailing slashes on the configured base would otherwise produce a double one.
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/admin/redefinir-senha?token=${encodeURIComponent(token)}`;
}

/** How long every response to the public reset-request form takes, whether or not
 *  the address exists. See remainingFloorMs. */
export const RESET_RESPONSE_FLOOR_MS = 700;

/** Milliseconds still owed before a response may be returned.
 *
 *  The login action equalises timing with a decoy bcrypt hash, because both of its
 *  branches do exactly one bcrypt compare and nothing else expensive. The reset
 *  request cannot use that trick: its expensive step on the "email exists" branch
 *  is a database INSERT plus an email send, and there is no honest decoy for an
 *  INSERT — the row has a foreign key to an admin that, on this branch, does not
 *  exist. So the equaliser is a floor on the whole response instead.
 *
 *  Its limit, stated plainly: this only equalises while the real branch finishes
 *  INSIDE the floor. 700ms comfortably covers a Neon insert plus the development
 *  console sender. When a real provider is wired in, its latency lands inside this
 *  window too — check that it does, and raise the floor rather than dropping it,
 *  or the "exists" branch becomes measurably slower again and the form turns back
 *  into an account-existence oracle. */
export function remainingFloorMs(elapsedMs: number, floorMs: number = RESET_RESPONSE_FLOOR_MS): number {
  const remaining = floorMs - elapsedMs;
  return remaining > 0 ? remaining : 0;
}
