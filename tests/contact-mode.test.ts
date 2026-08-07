import { describe, it, expect } from 'vitest';
import { effectiveMode, modeAfterUndeliveredTurn, HUMAN_MODE_TIMEOUT_MS } from '@/lib/contact-mode';
import type { ContactMode } from '@/lib/types';

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

/** The full truth table. A mode transition may be persisted BEFORE delivery only
 *  if it is a fact about what the MEMBER did; a transition that only makes sense
 *  because they RECEIVED something waits for a successful send. Suspension is
 *  just the permanent case of "the send did not happen", which is why nothing
 *  here knows what suspension is. */
describe('modeAfterUndeliveredTurn', () => {
  const cases: [ContactMode, ContactMode, ContactMode, string][] = [
    ['bot', 'bot', 'bot', 'nothing to commit'],
    ['bot', 'awaiting_prayer', 'bot', 'never arm a capture for a prompt that did not arrive'],
    ['bot', 'human', 'bot', 'never hand off to a human nobody was told about'],
    ['awaiting_prayer', 'bot', 'bot', 'their prayer turn ended when they wrote it'],
    ['awaiting_prayer', 'awaiting_prayer', 'awaiting_prayer', 'still waiting on a real prayer'],
    ['awaiting_prayer', 'human', 'bot', 'disarm: leaving them armed is the bug we are fixing'],
    ['human', 'bot', 'bot', 'an escape word ends a handoff regardless of delivery'],
    ['human', 'awaiting_prayer', 'human', 'do not arm a member who is mid-handoff'],
    ['human', 'human', 'human', 'never end a live handoff'],
  ];

  it.each(cases)('(%s → %s) commits %s — %s', (mode, nextMode, expected) => {
    expect(modeAfterUndeliveredTurn(mode, nextMode)).toBe(expected);
  });

  it('disarms a mid-prayer member who asks for a human', () => {
    // Called out separately because it is the case three independent designs got
    // wrong: falling back to the stored mode here leaves the member armed, so
    // their next ordinary message is filed as their prayer request.
    expect(modeAfterUndeliveredTurn('awaiting_prayer', 'human')).toBe('bot');
  });

  it('never ends a live handoff', () => {
    // The opposite trap: clamping everything to 'bot' would silently cancel a
    // handoff staff were already working, at the moment a grace period lapsed.
    expect(modeAfterUndeliveredTurn('human', 'human')).toBe('human');
  });
});
