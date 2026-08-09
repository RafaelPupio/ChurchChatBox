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

/** The same rule as mayRequestNewToken, rearranged into a value SQL can compare
 *  against: a new link is allowed when the last live one was created AT OR BEFORE
 *  this instant.
 *
 *  It exists because the throttle now runs inside the database, as one predicate
 *  in the single statement that mints a token (see issueResetToken). The interval
 *  itself must not be duplicated into SQL as a literal `interval '60 seconds'` —
 *  that would give RESET_REQUEST_MIN_INTERVAL_MS a second owner that no type error
 *  and no pure test would keep in step. The statement gets a timestamp computed
 *  from the constant instead, and reset-token.test.ts asserts the two forms agree
 *  for the same inputs. */
export function resetRequestCutoff(now: Date): Date {
  return new Date(now.getTime() - RESET_REQUEST_MIN_INTERVAL_MS);
}

/** The absolute link that goes in the email. Kept pure so the URL shape is
 *  testable without a request context. */
export function resetLinkFor(baseUrl: string, token: string): string {
  // Trailing slashes on the configured base would otherwise produce a double one.
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/admin/redefinir-senha?token=${encodeURIComponent(token)}`;
}

/** The measured p99 of ONE neon-http statement, and therefore of either branch of
 *  the reset-request form now that both are one statement.
 *
 *  Measured 2026-08-08 against this project's actual Neon database, 60 samples
 *  after warm-up, timing whole statements from the application side (a 40-sample
 *  run agreed to within 4ms on every line):
 *
 *      select 1                p50 177.2ms  p95 192.1ms  p99 266.8ms
 *      lookup, known address   p50 177.6ms  p95 260.7ms  p99 269.3ms
 *      lookup, unknown address p50 177.9ms  p95 258.6ms  p99 262.3ms
 *      purge DELETE            p50 177.3ms  p95 183.1ms  p99 183.7ms
 *      throttle SELECT         p50 177.2ms  p95 192.6ms  p99 257.8ms
 *      token INSERT            p50 178.5ms  p95 186.1ms  p99 264.3ms
 *      issue statement, known  p50 178.4ms  p95 263.7ms  p99 269.6ms
 *      issue statement, unknown p50 178.3ms p95 264.1ms  p99 265.2ms
 *
 *  Read the whole table before changing anything here. Every line is the same
 *  ~177ms, whether Postgres is probing one index, deleting rows, or running a
 *  four-part data-modifying CTE. The cost is the HTTPS round trip and essentially
 *  nothing else. That single fact is what the design rests on: round trips are the
 *  unit, so equal round trips means equal time, and the only way to make the two
 *  branches of a public form indistinguishable is to give them the same count.
 *
 *  It is a laptop-to-Neon measurement, so it is an over-estimate of what a Vercel
 *  function colocated with the database pays; nothing below breaks if the real
 *  figure is smaller. Re-measure before trusting it in a different region. */
export const MEASURED_ROUND_TRIP_P99_MS = 272;

/** How long every response to the public reset-request form takes, whether or not
 *  the address exists.
 *
 *  MEASURED_ROUND_TRIP_P99_MS rounded up with ~1.5x of headroom. It is deliberately
 *  LOWER than the 700ms it replaces, and that is not a weakened defence — see
 *  remainingFloorMs for why the floor is no longer what equalises the branches, and
 *  src/app/admin/esqueci-senha/actions.ts for why every millisecond of it is a bill
 *  on an endpoint anybody on the internet can call. */
export const RESET_RESPONSE_FLOOR_MS = 400;

/** Milliseconds still owed before a response may be returned.
 *
 *  WHAT THIS IS NOT, because it was once mistaken for it: this is not the thing
 *  that makes the two branches take the same time. It cannot be. A floor equalises
 *  only while BOTH branches finish inside it, and until this commit the "address
 *  exists" branch did not — it issued four separate neon-http statements
 *  (findAdminByEmail, the purge DELETE, the throttle SELECT, the INSERT) against
 *  one for an address belonging to nobody. Measured, 60 samples:
 *
 *      known    min 702.9ms  p50 713.2ms  p95 800.8ms  max 841.2ms
 *      unknown  min 174.6ms  p50 177.6ms  p95 184.6ms  max 264.8ms
 *
 *  Against a 700ms floor that is worse than "no padding on the slow branch". The
 *  floor pinned the UNKNOWN branch to a flat 700ms, erasing its variance, while
 *  the KNOWN branch reported its raw elapsed time and never once landed inside the
 *  floor: its FASTEST sample of 60 was 702.9ms. So every unknown address answered
 *  in ~700ms with almost no spread, and every known address answered slower, half
 *  of them by more than 13ms and one in twenty by more than 100ms. A handful of
 *  POSTs and a median said whether an address administers a church — and
 *  admin_user.email is globally unique here, so that answer crosses churches. The
 *  padding did not blur the branches; by removing the fast one's variance it made
 *  them easier to tell apart than a raw comparison would have.
 *
 *  The equaliser is the SHAPE OF THE WORK: both branches are now exactly one
 *  neon-http statement (see issueResetToken), and the measurement above shows the
 *  known and unknown forms of it are indistinguishable — 178.4ms against 178.3ms
 *  at the median, a tenth of a millisecond apart against ~90ms of jitter either
 *  one carries. Padding cannot hide a difference bigger than itself, and it strips
 *  the fast branch's variance while it tries; not creating the difference works.
 *
 *  What the floor is FOR, now that it is not load-bearing:
 *
 *  1. The over-254-character branch does ZERO round trips (RFC 5321 says that input
 *     cannot be an address, so it never reaches the database). The floor is what
 *     makes a 0-statement response indistinguishable from a 1-statement one.
 *  2. It absorbs whatever the "exists" branch does AFTER the statement. Today that
 *     is sendPasswordResetEmail on the console transport, which delivers nothing
 *     and costs nothing. When a real provider is wired into src/lib/email/index.ts
 *     it will cost hundreds of milliseconds, on the known branch only, and the
 *     floor is all that stands between that and a reopened oracle. Whoever wires it
 *     in must check its latency against this floor — and the honest fix, if it does
 *     not fit, is to move the send OUT of the response (Next's `after()`) rather
 *     than to keep inflating a number every visitor pays for.
 *
 *  Because the floor is a defence that can silently stop applying, it does not
 *  fail silently: floorOverrunMs is what the caller logs when a branch runs past
 *  it, which is the alarm this code did not have when it needed it. */
export function remainingFloorMs(elapsedMs: number, floorMs: number = RESET_RESPONSE_FLOOR_MS): number {
  const remaining = floorMs - elapsedMs;
  return remaining > 0 ? remaining : 0;
}

/** By how much a branch overran the floor: 0 while the floor still applies, and a
 *  positive number the moment it has stopped applying.
 *
 *  The exact complement of remainingFloorMs, which cannot distinguish "the floor
 *  is holding with nothing left to pay" from "the floor was blown through" — both
 *  are 0 there, and that ambiguity is how a 25.8ms overrun went unnoticed while it
 *  grew into a 545ms oracle. Exactly one of these two functions is non-zero for
 *  any elapsed time; reset-token.test.ts pins that. */
export function floorOverrunMs(elapsedMs: number, floorMs: number = RESET_RESPONSE_FLOOR_MS): number {
  const overrun = elapsedMs - floorMs;
  return overrun > 0 ? overrun : 0;
}
