import { describe, it, expect } from 'vitest';
import { isReplyWindowOpen, hoursRemaining, REPLY_WINDOW_MS } from '@/lib/reply-window';

const now = new Date('2026-07-16T12:00:00Z');
const agoHours = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe('REPLY_WINDOW_MS', () => {
  it('is 24 hours', () => {
    expect(REPLY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isReplyWindowOpen', () => {
  it('is open one hour after the last inbound message', () => {
    expect(isReplyWindowOpen(agoHours(1), now)).toBe(true);
  });
  it('is open just under 24h', () => {
    expect(isReplyWindowOpen(agoHours(23.9), now)).toBe(true);
  });
  it('is closed at exactly 24h', () => {
    expect(isReplyWindowOpen(agoHours(24), now)).toBe(false);
  });
  it('is closed after 24h', () => {
    expect(isReplyWindowOpen(agoHours(30), now)).toBe(false);
  });
  it('is closed when the member never messaged (null)', () => {
    expect(isReplyWindowOpen(null, now)).toBe(false);
  });
});

describe('hoursRemaining', () => {
  it('reports 23 whole hours one hour in', () => {
    expect(hoursRemaining(agoHours(1), now)).toBe(23);
  });
  it('reports 0 in the final partial hour but window still open', () => {
    expect(hoursRemaining(agoHours(23.5), now)).toBe(0);
    expect(isReplyWindowOpen(agoHours(23.5), now)).toBe(true);
  });
  it('reports 0 once closed', () => {
    expect(hoursRemaining(agoHours(25), now)).toBe(0);
  });
  it('reports 0 for null', () => {
    expect(hoursRemaining(null, now)).toBe(0);
  });
});
