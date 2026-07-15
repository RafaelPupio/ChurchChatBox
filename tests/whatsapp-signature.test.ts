import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifySignature } from '@/lib/whatsapp';

const SECRET = 'app-secret';
const BODY = JSON.stringify({ hello: 'world' });

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('verifySignature', () => {
  it('accepts a correctly signed body', () => {
    expect(verifySignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a body signed with the wrong secret', () => {
    expect(verifySignature(BODY, sign(BODY, 'wrong'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifySignature('{"hello":"evil"}', sign(BODY), SECRET)).toBe(false);
  });

  it.each([null, '', 'garbage', 'sha1=abc', 'sha256=nothex'])('rejects header %j', (header) => {
    expect(verifySignature(BODY, header, SECRET)).toBe(false);
  });
});
