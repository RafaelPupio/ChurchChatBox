/** A fixed number of slots, handed out and handed back. Nothing waits: a caller
 *  that cannot get a slot is told so and is expected to shed the work.
 *
 *  This exists because this codebase has NO RATE LIMITING OF ANY KIND and one of
 *  its endpoints — the public password-reset form — is unauthenticated, does a
 *  database round trip, and then deliberately sleeps. Anyone can make a Vercel
 *  function sit there being paid for. A queue would be the wrong answer: queuing
 *  requests keeps the functions alive, which is the cost being amplified. Refusing
 *  instantly is what makes the flood cheap to absorb.
 *
 *  WHAT IT DOES NOT DO, so nobody mistakes it for the limiter this repo still
 *  needs. The count lives in one process's memory. It bounds how much work a
 *  SINGLE serverless instance will have in flight at once; it does not bound how
 *  many instances Vercel starts, it forgets everything when an instance is
 *  recycled, and it cannot tell one caller from a thousand because it never looks
 *  at who is asking. It caps the amplification factor per instance. A real cap on
 *  request RATE has to sit in front of the function — a Vercel WAF rate rule, or a
 *  counter in shared storage keyed by IP — and neither exists here yet.
 *
 *  Deliberately has no clock and no timers: everything about it is decidable from
 *  the call sequence alone, which is why tests/concurrency-gate.test.ts can pin its
 *  behaviour exactly instead of racing it. */
export class ConcurrencyGate {
  private inFlight = 0;

  /** @param limit how many slots exist. Must be at least 1. */
  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`ConcurrencyGate needs a positive integer limit, got ${limit}`);
    }
  }

  /** Takes a slot if one is free. TRUE means the caller now owes a release() and
   *  must pair it in a `finally` — a leaked slot is never recovered, and enough of
   *  them turn the gate into a permanently closed door. */
  tryAcquire(): boolean {
    if (this.inFlight >= this.limit) return false;
    this.inFlight += 1;
    return true;
  }

  /** Hands a slot back. Never drops below zero: an accidental double release must
   *  not manufacture capacity that was never taken, which would let the gate hold
   *  more than `limit` in flight — silently, and only under load. */
  release(): void {
    if (this.inFlight > 0) this.inFlight -= 1;
  }

  /** How many slots are currently taken. For tests and for logging. */
  get active(): number {
    return this.inFlight;
  }
}
