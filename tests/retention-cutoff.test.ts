import { describe, expect, it } from 'vitest';
import { RETENTION_MS, retentionCutoff } from '@/lib/retention';

const DAY = 24 * 60 * 60 * 1000;

describe('retentionCutoff', () => {
  it('is 365 days', () => {
    expect(RETENTION_MS).toBe(365 * DAY);
  });

  it('returns now minus 365 days', () => {
    const now = new Date('2026-08-11T06:00:00.000Z');
    expect(retentionCutoff(now).toISOString()).toBe('2025-08-11T06:00:00.000Z');
  });

  it('a row exactly 365 days old is NOT past the cutoff', () => {
    // The purge predicate is `created_at < cutoff`, strictly. A row whose age is
    // exactly the retention period survives one more day, which is the forgiving
    // direction and the one a member would expect.
    const now = new Date('2026-08-11T06:00:00.000Z');
    const exactly = new Date(now.getTime() - RETENTION_MS);
    expect(exactly < retentionCutoff(now)).toBe(false);
  });

  it('one second older is past it; one second younger is not', () => {
    const now = new Date('2026-08-11T06:00:00.000Z');
    const cutoff = retentionCutoff(now);
    expect(new Date(now.getTime() - RETENTION_MS - 1000) < cutoff).toBe(true);
    expect(new Date(now.getTime() - RETENTION_MS + 1000) < cutoff).toBe(false);
  });

  it('does not read the clock itself', () => {
    // Purity: the same input twice gives the same answer, so a test can pin a date
    // and the purge can be driven from a fixture rather than from wall time.
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(retentionCutoff(now).getTime()).toBe(retentionCutoff(now).getTime());
  });
});
