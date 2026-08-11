import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPhone } from '@/lib/erasure-hash';

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

  it('returns null when the secret is unset — it never throws', () => {
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
