import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('password hashing', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('sup3r-secret');
    expect(await verifyPassword('sup3r-secret', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('sup3r-secret');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('never stores the plaintext', async () => {
    const hash = await hashPassword('sup3r-secret');
    expect(hash).not.toContain('sup3r-secret');
    expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix
  });

  it('produces a different hash each time (salted)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same', a)).toBe(true);
    expect(await verifyPassword('same', b)).toBe(true);
  });
});
