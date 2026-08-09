import { describe, it, expect } from 'vitest';
import { isAuthenticated } from '@/lib/auth/session';
import { isOwnerAuthenticated } from '@/lib/auth/owner-session';

describe('session kind isolation', () => {
  it('accepts a well-formed session of its own kind', () => {
    // pwdAt is part of "well-formed" now: every guard checks it, so a cookie
    // without one is refused downstream and must be refused here too.
    expect(isAuthenticated({ kind: 'admin', adminUserId: 'a1', pwdAt: 1_700_000_000_000 })).toBe(true);
    expect(isOwnerAuthenticated({ kind: 'owner', ownerUserId: 'o1' })).toBe(true);
  });

  it('rejects a church admin payload at the owner guard', () => {
    // Both cookies are sealed with the same SESSION_SECRET, so an sv_admin value
    // pasted into sv_owner unseals. `kind` is what actually rejects it.
    expect(isOwnerAuthenticated({ kind: 'admin', ownerUserId: 'a1' } as never)).toBe(false);
    expect(isOwnerAuthenticated({ ownerUserId: 'a1' } as never)).toBe(false);
  });

  it('rejects an owner payload at the church guard', () => {
    expect(isAuthenticated({ kind: 'owner', adminUserId: 'o1' } as never)).toBe(false);
  });

  it('rejects empty and missing ids', () => {
    expect(isAuthenticated({ kind: 'admin', adminUserId: '' })).toBe(false);
    expect(isOwnerAuthenticated({ kind: 'owner', ownerUserId: '' })).toBe(false);
    expect(isAuthenticated({})).toBe(false);
    expect(isOwnerAuthenticated({})).toBe(false);
  });
});

/** A cookie that no guard will honour must not read as authenticated, or the
 *  login page and the panel bounce a user between them forever.
 *
 *  This shipped: `pwdAt` was added by the password-reset work and checked by
 *  every guard via sessionMatchesPassword, but isAuthenticated never looked at
 *  it. So the login page saw "already signed in" and redirected into the panel,
 *  whose guard refused and redirected back. Every existing session hit it,
 *  because every cookie issued before that work predates the claim — the whole
 *  panel was unreachable and the server log showed nothing but paired 307s. */
describe('a session without pwdAt is not authenticated', () => {
  const base = { kind: 'admin' as const, adminUserId: 'a-1', churchId: 'c-1', name: 'Cida' };

  it('accepts a session carrying pwdAt', () => {
    expect(isAuthenticated({ ...base, pwdAt: 1_700_000_000_000 })).toBe(true);
  });

  it('REFUSES a session issued before pwdAt existed, rather than looping', () => {
    expect(isAuthenticated({ ...base, pwdAt: undefined })).toBe(false);
  });

  it('refuses a pwdAt that is not a number, whatever arrives on the wire', () => {
    expect(isAuthenticated({ ...base, pwdAt: '1700000000000' as unknown as number })).toBe(false);
  });
});
