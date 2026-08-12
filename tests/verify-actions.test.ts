import { beforeEach, describe, expect, it, vi } from 'vitest';

/** vi.mock factories are hoisted above every import AND above any top-level
 *  `const`, so a factory closing over a plain `const x = vi.fn()` throws
 *  "Cannot access 'x' before initialization". vi.hoisted() is itself hoisted
 *  alongside the mocks, so its return value exists by the time the factories
 *  below execute. Same pattern as tests/member-data-actions.test.ts. */
const h = vi.hoisted(() => ({
  requireReadableSession: vi.fn(),
  findErasureByPhoneHash: vi.fn(),
}));

vi.mock('@/lib/auth/writable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/writable')>('@/lib/auth/writable');
  return { ...actual, requireReadableSession: h.requireReadableSession };
});
vi.mock('@/lib/repo/erasure', () => ({ findErasureByPhoneHash: h.findErasureByPhoneHash }));

import { verifyErasure } from '@/app/admin/(protected)/configuracoes/verify-actions';
import { phoneHashCandidates } from '@/lib/erasure-hash';

const { requireReadableSession, findErasureByPhoneHash } = h;

function fd(phone: string): FormData {
  const f = new FormData();
  f.set('phone', phone);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireReadableSession.mockResolvedValue({ churchId: 'c1' });
  process.env.ERASURE_HASH_SECRET = 'segredo-de-teste';
});

/** Finding A2: the decision to call phoneHashCandidates(...) — rather than a
 *  single hashPhone(...) — is unpinned. phoneHashCandidates itself is well
 *  tested as a pure function (tests/erasure-hash.test.ts); nothing pins that
 *  verify-actions.ts actually CALLS it instead of the single-hash function it
 *  replaced. Reverting to `hashPhone(String(formData.get('phone') ?? ''))`
 *  changes no test, and reintroduces the exact false negative
 *  tests/erasure-hash.test.ts's own history describes: a DDD-55 number typed
 *  without its country code answers "not erased" for a member who was. */
describe('verifyErasure — the phoneHashCandidates decision', () => {
  it('finds a DDD 55 mobile stored WITH its country code, typed WITHOUT one', async () => {
    const typed = '(55) 99999-8888';
    const candidates = phoneHashCandidates(typed);
    // Sanity on the fixture itself: more than one candidate must exist, or this
    // test would not be able to tell phoneHashCandidates apart from hashPhone.
    expect(candidates.length).toBeGreaterThan(1);

    // Only the LAST candidate — the 55-prefixed form, per phoneHashCandidates'
    // own most-likely-first ordering — has a stored match. The first candidate
    // (the typed digits, unprefixed) is exactly what a single hashPhone(...)
    // call would produce and stop at.
    const matchingHash = candidates[candidates.length - 1];
    findErasureByPhoneHash.mockImplementation(async (_churchId: string, hash: string) => {
      if (hash !== matchingHash) return null;
      return {
        id: 'r1', reason: 'subject_request' as const, status: 'done' as const,
        subjectContactId: null, subjectPhoneHash: hash, performedByEmail: 'secretaria@igreja.org',
        messagesDeleted: 4, prayersDeleted: 0, contactsDeleted: 1,
        createdAt: new Date('2026-03-12T12:00:00Z'), completedAt: new Date('2026-03-12T12:00:01Z'),
      };
    });

    const result = await verifyErasure({ message: '' }, fd(typed));
    expect(result.message).toBe('Sim. Os dados deste número foram apagados em 12/03/2026.');
  });
});

/** Finding B1: an empty or non-numeric box and a missing ERASURE_HASH_SECRET
 *  both make phoneHashCandidates return [], and the old code answered both with
 *  "A verificação não está disponível nesta instalação." — telling a secretary
 *  who submitted a blank field that the feature does not exist in this
 *  deployment. verify-actions.ts now checks for typed digits BEFORE calling
 *  phoneHashCandidates, so the two causes get two different pt-BR messages. */
describe('verifyErasure — blank box vs missing secret (B1)', () => {
  it('asks for digits when the box is empty, even though a secret IS configured', async () => {
    const result = await verifyErasure({ message: '' }, fd(''));
    expect(result.message).toBe('Digite o número de WhatsApp que deseja verificar.');
    expect(findErasureByPhoneHash).not.toHaveBeenCalled();
  });

  it('asks for digits when the box has no digits at all', async () => {
    const result = await verifyErasure({ message: '' }, fd('não sei o número'));
    expect(result.message).toBe('Digite o número de WhatsApp que deseja verificar.');
  });

  it('reports unavailable — a DIFFERENT message — when digits were typed but the operator secret is unset', async () => {
    delete process.env.ERASURE_HASH_SECRET;
    const result = await verifyErasure({ message: '' }, fd('11999998888'));
    expect(result.message).toBe('A verificação não está disponível nesta instalação.');
  });
});
