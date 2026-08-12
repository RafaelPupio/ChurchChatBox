import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPhone, phoneHashCandidates } from '@/lib/erasure-hash';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hashPhone', () => {
  it('returns a stable hex digest for the same number', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    const a = hashPhone('5511999998888');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPhone('5511999998888')).toBe(a);
  });

  it('normalises to digits, so formatting never changes the answer', () => {
    // The same person's number is written a dozen ways across WhatsApp, a
    // secretary's typing, and the verify box. If those hash differently the
    // verification box answers "nenhuma exclusão registrada" for a number that
    // was in fact erased — the one question this hash exists to answer.
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    const canonical = hashPhone('5511999998888');
    expect(hashPhone('+55 11 99999-8888')).toBe(canonical);
    expect(hashPhone('(55) 11 99999 8888')).toBe(canonical);
    expect(hashPhone(' 5511999998888 ')).toBe(canonical);
  });

  it('different numbers hash differently', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    expect(hashPhone('5511999998888')).not.toBe(hashPhone('5511999998889'));
  });

  it('is keyed — a different secret gives a different digest', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-a');
    const a = hashPhone('5511999998888');
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-b');
    expect(hashPhone('5511999998888')).not.toBe(a);
  });

  it('never throws on a non-string input, it returns null', () => {
    // The previous name promised "it never throws" while only exercising the
    // missing-secret path — the same overclaiming shape a sibling review caught in
    // this subsystem's Task 1. These are the inputs that actually threw.
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    expect(hashPhone(null as unknown as string)).toBeNull();
    expect(hashPhone(undefined as unknown as string)).toBeNull();
    expect(hashPhone(5511999998888 as unknown as string)).toBeNull();
    expect(hashPhone({} as unknown as string)).toBeNull();
  });

  it('returns null when the secret is unset', () => {
    // Fails TOWARD the member's right, mirroring effectiveStatus's fail-toward-
    // service. A missing operator env var must never be the reason a statutory
    // erasure does not happen; the erasure proceeds and stores a null hash.
    vi.stubEnv('ERASURE_HASH_SECRET', '');
    expect(hashPhone('5511999998888')).toBeNull();
  });

  it('returns null for a number with no digits at all', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    expect(hashPhone('')).toBeNull();
    expect(hashPhone('sem números')).toBeNull();
  });
});

describe('phoneHashCandidates', () => {
  it('matches a stored webhook number when the secretary types a local one', () => {
    // The whole point. Stored: 5511999998888 (Meta's `from`).
    // Typed:  (11) 99999-8888. Without the 55 variant these never meet.
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    const stored = hashPhone('5511999998888');
    expect(phoneHashCandidates('(11) 99999-8888')).toContain(stored);
  });

  it('still matches when the secretary types the full number', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    expect(phoneHashCandidates('+55 11 99999-8888')).toContain(hashPhone('5511999998888'));
  });

  it('covers a 10-digit landline too', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    expect(phoneHashCandidates('11 3333-4444')).toContain(hashPhone('551133334444'));
  });

  it('does not invent a 55 for a number that already has one', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    expect(phoneHashCandidates('5511999998888')).toEqual([hashPhone('5511999998888')]);
  });

  it('returns [] with no secret, and [] for a number with no digits', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    expect(phoneHashCandidates('sem números')).toEqual([]);
    vi.stubEnv('ERASURE_HASH_SECRET', '');
    expect(phoneHashCandidates('5511999998888')).toEqual([]);
  });
});
