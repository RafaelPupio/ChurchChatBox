import { describe, it, expect } from 'vitest';
import { isAuthenticated } from '@/lib/auth/session';

describe('isAuthenticated', () => {
  it('is true when a session carries an admin id and kind', () => {
    // pwdAt belongs to a well-formed session: every guard checks it, so a cookie
    // without one is refused downstream and must be refused here too — see the
    // redirect-loop note in isAuthenticated.
    expect(isAuthenticated({ kind: 'admin', adminUserId: 'abc', pwdAt: 1_700_000_000_000 })).toBe(true);
  });

  it('is false for an empty session', () => {
    expect(isAuthenticated({})).toBe(false);
  });

  it('is false when the id is an empty string', () => {
    expect(isAuthenticated({ kind: 'admin', adminUserId: '' })).toBe(false);
  });

  it('is false when kind is missing, even with a valid id', () => {
    expect(isAuthenticated({ adminUserId: 'abc' })).toBe(false);
  });
});
