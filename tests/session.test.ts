import { describe, it, expect } from 'vitest';
import { isAuthenticated } from '@/lib/auth/session';

describe('isAuthenticated', () => {
  it('is true when a session carries an admin id and kind', () => {
    expect(isAuthenticated({ kind: 'admin', adminUserId: 'abc' })).toBe(true);
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
