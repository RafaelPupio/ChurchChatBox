import { describe, expect, it } from 'vitest';
import { ConcurrencyGate } from '@/lib/concurrency-gate';

/**
 * The load shed in front of the public password-reset form.
 *
 * It has no clock and no timers on purpose, so everything about it is decidable
 * from the call sequence — these assertions pin exact behaviour rather than
 * racing real concurrency and hoping.
 */

describe('handing out slots', () => {
  it('gives out exactly as many as it has', () => {
    const gate = new ConcurrencyGate(3);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.active).toBe(3);
  });

  it('refuses rather than queueing, which is the whole point', () => {
    // A queue would keep the serverless function alive, and function-seconds are
    // the resource being amplified. tryAcquire returns a boolean and never a
    // promise, so there is nothing to await and nothing to wait in.
    const gate = new ConcurrencyGate(1);
    gate.tryAcquire();
    const refused = gate.tryAcquire();
    expect(refused).toBe(false);
    expect(refused).not.toBeInstanceOf(Promise);
  });

  it('lets the next caller in as soon as one is handed back', () => {
    const gate = new ConcurrencyGate(2);
    gate.tryAcquire();
    gate.tryAcquire();
    expect(gate.tryAcquire()).toBe(false);

    gate.release();

    expect(gate.active).toBe(1);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
  });

  it('recovers completely once every slot comes back', () => {
    const gate = new ConcurrencyGate(4);
    for (let i = 0; i < 4; i += 1) expect(gate.tryAcquire()).toBe(true);
    for (let i = 0; i < 4; i += 1) gate.release();

    expect(gate.active).toBe(0);
    for (let i = 0; i < 4; i += 1) expect(gate.tryAcquire()).toBe(true);
  });
});

describe('releases that should not have happened', () => {
  it('never manufactures capacity out of an extra release', () => {
    // The failure this prevents is invisible until load: a stray release would let
    // the gate hold more than `limit` in flight, i.e. the cap silently stops being
    // a cap exactly when it is needed.
    const gate = new ConcurrencyGate(2);
    gate.release();
    gate.release();
    gate.release();
    expect(gate.active).toBe(0);

    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
  });

  it('closes for good if callers leak slots, which is why they pair it in a finally', () => {
    // Stated as a test rather than as a hope: a leaked slot is not recovered, so a
    // caller that can throw between acquiring and releasing must use `finally`.
    const gate = new ConcurrencyGate(2);
    gate.tryAcquire();
    gate.tryAcquire();
    // ...both callers vanish without releasing.
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.active).toBe(2);
  });
});

describe('a limit that could not do its job', () => {
  it('refuses to be built with one', () => {
    // A limit of 0 is a permanently closed endpoint and a negative one is nonsense;
    // both are configuration mistakes that would otherwise surface as "the reset
    // form silently stopped sending anything to anybody".
    expect(() => new ConcurrencyGate(0)).toThrow(/positive integer/i);
    expect(() => new ConcurrencyGate(-1)).toThrow(/positive integer/i);
    expect(() => new ConcurrencyGate(1.5)).toThrow(/positive integer/i);
    expect(() => new ConcurrencyGate(Number.NaN)).toThrow(/positive integer/i);
  });

  it('accepts a limit of one', () => {
    expect(() => new ConcurrencyGate(1)).not.toThrow();
  });
});

describe('what it does under an actual burst', () => {
  it('admits the first N and sheds the rest, in arrival order', async () => {
    const gate = new ConcurrencyGate(6);
    const admitted: boolean[] = [];

    // Ten callers that all take a slot before any of them gives one back — the
    // shape of a flood against an endpoint that sleeps before responding.
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        const ok = gate.tryAcquire();
        admitted.push(ok);
        if (!ok) return;
        await Promise.resolve();
        gate.release();
      }),
    );

    expect(admitted.filter(Boolean)).toHaveLength(6);
    expect(admitted.slice(0, 6).every(Boolean)).toBe(true);
    expect(admitted.slice(6).some(Boolean)).toBe(false);
    // Everything handed back, so the next visitor is not punished for the flood.
    expect(gate.active).toBe(0);
  });
});
