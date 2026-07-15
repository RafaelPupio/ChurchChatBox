import { describe, it, expect } from 'vitest';
import { effectiveMode, HUMAN_MODE_TIMEOUT_MS } from '@/lib/contact-mode';

describe('effectiveMode', () => {
  it('passes bot through untouched regardless of age', () => {
    const modeChangedAt = new Date('2020-01-01T00:00:00Z');
    const now = new Date('2026-07-15T00:00:00Z');
    expect(effectiveMode('bot', modeChangedAt, now)).toBe('bot');
  });

  it('passes awaiting_prayer through untouched regardless of age', () => {
    const modeChangedAt = new Date('2020-01-01T00:00:00Z');
    const now = new Date('2026-07-15T00:00:00Z');
    expect(effectiveMode('awaiting_prayer', modeChangedAt, now)).toBe('awaiting_prayer');
  });

  it('keeps human mode within the 24h window', () => {
    const modeChangedAt = new Date('2026-07-15T00:00:00Z');
    const now = new Date(modeChangedAt.getTime() + HUMAN_MODE_TIMEOUT_MS - 1);
    expect(effectiveMode('human', modeChangedAt, now)).toBe('human');
  });

  it('reverts human mode to bot at exactly 24h', () => {
    const modeChangedAt = new Date('2026-07-15T00:00:00Z');
    const now = new Date(modeChangedAt.getTime() + HUMAN_MODE_TIMEOUT_MS);
    expect(effectiveMode('human', modeChangedAt, now)).toBe('bot');
  });

  it('reverts human mode to bot well past 24h', () => {
    const modeChangedAt = new Date('2026-07-01T00:00:00Z');
    const now = new Date('2026-07-15T00:00:00Z');
    expect(effectiveMode('human', modeChangedAt, now)).toBe('bot');
  });

  it('keeps a fresh human handoff as human', () => {
    const now = new Date('2026-07-15T12:00:00Z');
    const modeChangedAt = new Date(now.getTime());
    expect(effectiveMode('human', modeChangedAt, now)).toBe('human');
  });
});
