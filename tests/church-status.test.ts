import { describe, it, expect } from 'vitest';
import { effectiveStatus, GRACE_PERIOD_MS } from '@/lib/church-status';

const now = new Date('2026-08-06T12:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

describe('GRACE_PERIOD_MS', () => {
  it('is 7 days', () => {
    expect(GRACE_PERIOD_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('effectiveStatus', () => {
  it('leaves an active church active', () => {
    expect(effectiveStatus('active', null, now)).toBe('active');
  });

  it('leaves a suspended church suspended', () => {
    expect(effectiveStatus('suspended', null, now)).toBe('suspended');
  });

  it('keeps a past_due church running while inside the grace period', () => {
    expect(effectiveStatus('past_due', inDays(3), now)).toBe('past_due');
  });

  it('suspends a past_due church once the grace deadline passes', () => {
    expect(effectiveStatus('past_due', inDays(-1), now)).toBe('suspended');
  });

  it('suspends exactly at the deadline', () => {
    expect(effectiveStatus('past_due', now, now)).toBe('suspended');
  });

  it('never silences a church when grace_until is missing', () => {
    // Missing data must not take a church off the air — the bot keeps running.
    expect(effectiveStatus('past_due', null, now)).toBe('past_due');
  });

  it('ignores grace_until for non-past_due statuses', () => {
    expect(effectiveStatus('active', inDays(-30), now)).toBe('active');
  });
});
