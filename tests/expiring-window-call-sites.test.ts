import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Finding A1: EXPIRING_WINDOW_MS is added to retentionCutoff(now) at TWO call
 *  sites — src/app/admin/(protected)/oracao/page.tsx and .../configuracoes/page.tsx
 *  — and nothing pinned either addition. A reviewer neutralised `+ EXPIRING_WINDOW_MS`
 *  (collapsing "about to expire" into "already expired") at each site in turn and
 *  the whole suite stayed green, because every existing test of the underlying
 *  query (tests/expiring-prayers.test.ts) drives countExpiringPrayers directly
 *  with an explicit `before` — none of them go through either page to prove the
 *  page computes that argument correctly.
 *
 *  vi.mock factories are hoisted above every import AND above any top-level
 *  `const`, so a factory closing over a plain `const x = vi.fn()` throws
 *  "Cannot access 'x' before initialization". vi.hoisted() is itself hoisted
 *  alongside the mocks, so its return value exists by the time the factories
 *  below execute. Same pattern as tests/member-data-actions.test.ts. */
const h = vi.hoisted(() => ({
  requireReadableSession: vi.fn(),
  listPrayerRequests: vi.fn(),
  countExpiringPrayers: vi.fn(),
  getChurchById: vi.fn(),
  listAdmins: vi.fn(),
  listErasureRecords: vi.fn(),
}));

vi.mock('@/lib/auth/writable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/writable')>('@/lib/auth/writable');
  return { ...actual, requireReadableSession: h.requireReadableSession };
});
vi.mock('@/lib/repo/prayer-admin', () => ({
  listPrayerRequests: h.listPrayerRequests,
  countExpiringPrayers: h.countExpiringPrayers,
}));
vi.mock('@/lib/repo/church-admin', () => ({ getChurchById: h.getChurchById }));
vi.mock('@/lib/repo/admin', () => ({ listAdmins: h.listAdmins }));
vi.mock('@/lib/repo/erasure', () => ({ listErasureRecords: h.listErasureRecords }));

import OracaoPage from '@/app/admin/(protected)/oracao/page';
import ConfiguracoesPage from '@/app/admin/(protected)/configuracoes/page';
import { EXPIRING_WINDOW_MS } from '@/lib/expiring-window';
import { retentionCutoff } from '@/lib/retention';

const {
  requireReadableSession, listPrayerRequests, countExpiringPrayers,
  getChurchById, listAdmins, listErasureRecords,
} = h;

// Comfortably clear of midnight UTC in either direction, so the fixed-time
// assertions below do not depend on the host machine's timezone.
const NOW = new Date('2026-08-12T12:00:00.000Z');

const CHURCH = {
  id: 'c1', name: 'Igreja Teste',
  greetingText: '', menuHeaderText: '', menuButtonLabel: '', fallbackText: '',
  unsupportedMediaText: '', errorText: '', prayerPromptText: '', prayerThanksText: '',
  handoffText: '', handoffClosedText: '', courtesyText: '',
  phoneNumberId: null, accessToken: null, appSecret: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  requireReadableSession.mockResolvedValue({ churchId: 'c1', adminUserId: 'a1' });
  listPrayerRequests.mockResolvedValue([]);
  countExpiringPrayers.mockResolvedValue(0);
  getChurchById.mockResolvedValue(CHURCH);
  listAdmins.mockResolvedValue([]);
  listErasureRecords.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

/** The window the next 30 days of purges will destroy, computed the same way
 *  the pages are supposed to compute it. */
function expectedBefore(): Date {
  return new Date(retentionCutoff(NOW).getTime() + EXPIRING_WINDOW_MS);
}

describe('EXPIRING_WINDOW_MS is pinned at both call sites', () => {
  it('oracao/page.tsx asks for prayers expiring before retentionCutoff(now) + 30 days', async () => {
    await OracaoPage();
    expect(countExpiringPrayers).toHaveBeenCalledWith('c1', expectedBefore());
    // Not the bare cutoff — that is the mutation this test exists to catch:
    // dropping "+ EXPIRING_WINDOW_MS" turns "about to expire" into "already
    // expired" while the call still type-checks and still runs.
    const [, actualBefore] = countExpiringPrayers.mock.calls[0] as [string, Date];
    expect(actualBefore.getTime()).not.toBe(retentionCutoff(NOW).getTime());
  });

  it('configuracoes/page.tsx asks for prayers expiring before retentionCutoff(now) + 30 days', async () => {
    await ConfiguracoesPage();
    expect(countExpiringPrayers).toHaveBeenCalledWith('c1', expectedBefore());
    const [, actualBefore] = countExpiringPrayers.mock.calls[0] as [string, Date];
    expect(actualBefore.getTime()).not.toBe(retentionCutoff(NOW).getTime());
  });
});
