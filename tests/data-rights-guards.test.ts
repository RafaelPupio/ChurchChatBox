import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above every top-level statement, including plain
// `const` declarations — referencing an ordinary const here throws "Cannot access
// before initialization". vi.hoisted() is the documented escape hatch: it runs
// its callback as part of that same hoisting pass, so these four fns exist by the
// time the factories below run. Same pattern as tests/session-guards.test.ts.
const { findAdminById, getChurchById, getSession, requireSession } = vi.hoisted(() => ({
  findAdminById: vi.fn(),
  getChurchById: vi.fn(),
  getSession: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock('@/lib/repo/admin', () => ({ findAdminById }));
vi.mock('@/lib/repo/church-admin', () => ({ getChurchById }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session');
  return { ...actual, getSession, requireSession };
});

import { checkDataRightsSession, requireDataRightsSession } from '@/lib/auth/writable';

const PWD_AT = new Date('2026-01-01T00:00:00.000Z');
const SESSION = {
  adminUserId: 'admin-1', churchId: 'church-1', name: 'Secretária', pwdAt: PWD_AT.getTime(),
};
const ADMIN = { id: 'admin-1', churchId: 'church-1', email: 'secretaria@igreja.org', passwordChangedAt: PWD_AT };

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(SESSION);
  getSession.mockResolvedValue({ ...SESSION, isLoggedIn: true, kind: 'admin' });
  findAdminById.mockResolvedValue(ADMIN);
});

afterEach(() => { vi.restoreAllMocks(); });

describe('requireDataRightsSession', () => {
  it('returns the identity INCLUDING the email, sourced from the admin row', async () => {
    // erasure_record.performed_by_email must be a durable identifier. The session
    // carries no email, so it comes from the row verifyIdentity already fetched.
    const result = await requireDataRightsSession();
    expect(result).toEqual({
      adminUserId: 'admin-1', churchId: 'church-1', name: 'Secretária',
      email: 'secretaria@igreja.org',
    });
  });

  it('NEVER calls getChurchById — suspension is deliberately not checked', async () => {
    // This is the assertion that encodes the decision. An Art. 18 deadline does
    // not pause for a billing dispute between the vendor and the church, and the
    // fine lands on the church, not on the vendor. If a later refactor routes this
    // through requireWritableSession, this test is what fails.
    await requireDataRightsSession();
    expect(getChurchById).not.toHaveBeenCalled();
  });

  it('blocks a removed secretary — revocation IS still checked', async () => {
    findAdminById.mockResolvedValue(undefined);
    expect(await requireDataRightsSession()).toEqual({ blocked: 'revoked' });
  });

  it('blocks a secretary whose row now belongs to another church', async () => {
    findAdminById.mockResolvedValue({ ...ADMIN, churchId: 'church-2' });
    expect(await requireDataRightsSession()).toEqual({ blocked: 'revoked' });
  });

  it('blocks a cookie sealed before a password change', async () => {
    findAdminById.mockResolvedValue({ ...ADMIN, passwordChangedAt: new Date('2026-06-01T00:00:00Z') });
    expect(await requireDataRightsSession()).toEqual({ blocked: 'revoked' });
  });

  it('does not strip pwdAt into the returned identity', async () => {
    const result = await requireDataRightsSession();
    expect('pwdAt' in (result as Record<string, unknown>)).toBe(false);
  });
});

describe('checkDataRightsSession', () => {
  it('returns a sentinel rather than redirecting when there is no session', async () => {
    // A route handler that let NEXT_REDIRECT escape would serialise a framework
    // control-flow signal into its own JSON body — a bug already fixed once in
    // src/app/api/blob/upload/route.ts.
    getSession.mockResolvedValue({ isLoggedIn: false });
    expect(await checkDataRightsSession()).toEqual({ blocked: 'unauthenticated' });
  });

  it('returns the identity for a current secretary', async () => {
    expect(await checkDataRightsSession()).toEqual({
      adminUserId: 'admin-1', churchId: 'church-1', name: 'Secretária',
      email: 'secretaria@igreja.org',
    });
  });

  it('blocks a removed secretary', async () => {
    findAdminById.mockResolvedValue(undefined);
    expect(await checkDataRightsSession()).toEqual({ blocked: 'revoked' });
  });

  it('NEVER calls getChurchById', async () => {
    await checkDataRightsSession();
    expect(getChurchById).not.toHaveBeenCalled();
  });
});
