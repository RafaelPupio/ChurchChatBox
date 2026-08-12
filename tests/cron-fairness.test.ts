import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock() factories are hoisted above ordinary top-level `const`s, so a
// factory that closes over a plain `const x = vi.fn()` throws "Cannot access
// 'x' before initialization" — the const's own initializer runs later in
// source order than the hoisted mock. vi.hoisted() runs its callback as part
// of that same hoisting pass, before the factories, which is why every other
// mocked-module test in this repo (e.g. tests/webhook-alarm.test.ts) uses it.
const { listChurchIdsForPurge, markChurchPurged, hasPurgeWork, openRetentionRecord } = vi.hoisted(() => ({
  listChurchIdsForPurge: vi.fn(),
  markChurchPurged: vi.fn(),
  hasPurgeWork: vi.fn(),
  openRetentionRecord: vi.fn(),
}));

vi.mock('@/lib/repo/retention', () => ({
  listChurchIdsForPurge, markChurchPurged, hasPurgeWork, openRetentionRecord,
  addRetentionCounts: vi.fn(), purgeMessageBatch: vi.fn().mockResolvedValue(0),
  purgePrayerBatch: vi.fn().mockResolvedValue(0), purgeContactBatch: vi.fn().mockResolvedValue(0),
  completeErasureRecordSystem: vi.fn(), sweepStaleRetentionRecords: vi.fn().mockResolvedValue(0),
  listStalePendingErasures: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/repo/member-data', () => ({ deleteMember: vi.fn() }));

import { GET } from '@/app/api/cron/purge/route';

const ok = () => new Request('https://x/api/cron/purge', { headers: { authorization: 'Bearer s3cr3t' } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 's3cr3t');
  hasPurgeWork.mockResolvedValue(true);
  openRetentionRecord.mockResolvedValue('rec');
});

describe('the rotation', () => {
  it('advances the cursor for EVERY church it visits, finished or not', async () => {
    // This is what makes the rotation a rotation. A church whose slice is cut short
    // must still move to the back of the queue, or one large church starves the
    // platform forever.
    listChurchIdsForPurge.mockResolvedValue(['a', 'b', 'c']);
    await GET(ok());
    expect(markChurchPurged.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
  });

  it('advances the cursor and writes NO record for a church with no work', async () => {
    // Keeps "a retention row means something was actually deleted" true, while
    // still writing the row before the deletes.
    listChurchIdsForPurge.mockResolvedValue(['quiet']);
    hasPurgeWork.mockResolvedValue(false);
    await GET(ok());
    expect(openRetentionRecord).not.toHaveBeenCalled();
    expect(markChurchPurged).toHaveBeenCalledWith('quiet', expect.any(Date));
  });

  it('one church throwing does not end the run for the others', async () => {
    listChurchIdsForPurge.mockResolvedValue(['a', 'boom', 'c']);
    hasPurgeWork.mockImplementation(async (id: string) => {
      if (id === 'boom') throw new Error('neon down');
      return true;
    });
    const res = await GET(ok());
    expect(res.status).toBe(200);
    // Including the failed one: its slice ended, so its cursor advances too.
    expect(markChurchPurged.mock.calls.map((c) => c[0])).toEqual(['a', 'boom', 'c']);
  });

  it('completes stale erasures BEFORE spending the budget on the purge', async () => {
    // The sweeps are cheap and they heal receipts from a run that died. Doing them
    // first means an interrupted erasure finishes even on a night the purge runs long.
    const { listStalePendingErasures } = await import('@/lib/repo/retention');
    (listStalePendingErasures as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'r1', churchId: 'c1', subjectContactId: 'ct1' },
    ]);
    const { deleteMember } = await import('@/lib/repo/member-data');
    listChurchIdsForPurge.mockResolvedValue([]);

    const res = await GET(ok());
    expect(deleteMember).toHaveBeenCalledWith('c1', 'ct1');
    expect((await res.json()).erasuresCompleted).toBe(1);
  });
});
