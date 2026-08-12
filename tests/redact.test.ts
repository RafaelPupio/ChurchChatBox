import { describe, expect, it } from 'vitest';
import { redactError, redactPhones } from '@/lib/redact';

describe('redactPhones', () => {
  it('replaces a Brazilian mobile number', () => {
    expect(redactPhones('enviado para 5511999998888')).toBe('enviado para +55…XX');
  });

  it('replaces a number carrying a leading +', () => {
    expect(redactPhones('to=+5511999998888')).toBe('to=+55…XX');
  });

  it('leaves short digit runs alone — status codes and counts are not numbers to hide', () => {
    expect(redactPhones('Graph API 400 after 3 retries')).toBe('Graph API 400 after 3 retries');
  });

  it('replaces every occurrence, not just the first', () => {
    expect(redactPhones('de 5511999998888 para 5511777776666')).toBe('de +55…XX para +55…XX');
  });
});

describe('redactError', () => {
  it('keeps name, message and stack as TEXT while removing the digits', () => {
    // The two call sites log an Error, not a string, so redactPhones cannot be
    // applied directly. The cost of stringifying is that Vercel's log viewer no
    // longer receives a structured Error and cannot source-map it — accepted,
    // because a leaked member phone number in a log nobody purges is worse.
    const error = new Error('Graph API 400: {"error":{"message":"…5511999998888…"}}');
    const out = redactError(error);
    expect(out).toContain('Error');
    expect(out).toContain('Graph API 400');
    expect(out).not.toContain('5511999998888');
    expect(out).toContain('at ');   // the stack survived as text
  });

  it('handles a thrown non-Error without throwing itself', () => {
    // A catch-all that can itself throw turns a logged failure into an unlogged one.
    expect(redactError('só uma string 5511999998888')).not.toContain('5511999998888');
    expect(() => redactError(undefined)).not.toThrow();
    expect(() => redactError({ weird: true })).not.toThrow();
    // null was verified during implementation but not committed — so the suite's
    // coverage was narrower than the test's name promised. That is the exact defect
    // this subsystem shipped once in hashPhone ("it never throws", one path tested).
    expect(() => redactError(null)).not.toThrow();
    expect(redactError(null)).toBe('null');
  });
});
