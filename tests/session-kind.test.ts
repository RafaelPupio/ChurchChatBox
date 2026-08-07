import { describe, it, expect } from 'vitest';
import { isAuthenticated } from '@/lib/auth/session';
import { isOwnerAuthenticated } from '@/lib/auth/owner-session';

describe('session kind isolation', () => {
  it('accepts a well-formed session of its own kind', () => {
    expect(isAuthenticated({ kind: 'admin', adminUserId: 'a1' })).toBe(true);
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
