import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// vi.mock factories are hoisted above every import AND above any top-level
// `const`, so a factory that closes over a plain `const x = vi.fn()` throws
// "Cannot access 'x' before initialization" — the mock runs before the const
// is ever assigned. vi.hoisted() is itself hoisted alongside the mocks, so its
// return value exists by the time the factories below execute. Same pattern as
// tests/member-export-route.test.ts.
const h = vi.hoisted(() => ({
  checkDataRightsSession: vi.fn(),
  getChurchById: vi.fn(),
  pageExpiringPrayers: vi.fn(),
}));

vi.mock('@/lib/auth/writable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/writable')>('@/lib/auth/writable');
  return { ...actual, checkDataRightsSession: h.checkDataRightsSession };
});
vi.mock('@/lib/repo/church-admin', () => ({ getChurchById: h.getChurchById }));
vi.mock('@/lib/repo/prayer-admin', () => ({ pageExpiringPrayers: h.pageExpiringPrayers }));

import { GET } from '@/app/api/dados/oracoes-expirando/route';

const { checkDataRightsSession, getChurchById, pageExpiringPrayers } = h;

const ROUTE = join(process.cwd(), 'src/app/api/dados/oracoes-expirando/route.ts');

function prayer(i: number, at: string) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    text: `pedido ${i}`,
    status: 'novo' as const,
    createdAt: new Date(at),
    contactName: 'Dona Cida',
    contactPhone: '5511111111111',
  };
}

const call = (url = 'https://x/api/dados/oracoes-expirando') => GET(new Request(url));
// See the note in tests/member-export-route.test.ts: a macrotask boundary drains
// the whole microtask queue, so an eager producer runs to its ceiling here and a
// demand-driven one cannot advance at all.
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  checkDataRightsSession.mockResolvedValue({ adminUserId: 'a1', churchId: 'c1', name: 'Secretária' });
  getChurchById.mockResolvedValue({ id: 'c1', name: 'Igreja Exemplo' });
  pageExpiringPrayers.mockResolvedValue([]);
});

describe('route declarations', () => {
  it('declares maxDuration 60 and force-dynamic', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/export\s+const\s+maxDuration\s*=\s*60/);
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*'force-dynamic'/);
  });
});

describe('the body', () => {
  it('401s with no session, without leaking a redirect', async () => {
    checkDataRightsSession.mockResolvedValue({ blocked: 'unauthenticated' });
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('NEXT_REDIRECT');
  });

  it('closes as valid JSON when there is nothing expiring', async () => {
    // The empty collection is a real path: the warning renders only above zero,
    // but nothing stops a secretary re-fetching after the window empties.
    const parsed = JSON.parse(await (await call()).text());
    expect(parsed.pedidos_de_oracao).toEqual([]);
    expect(parsed.igreja).toBe('Igreja Exemplo');
    expect(parsed.aviso).toBeUndefined();
    expect(parsed.continuacao).toBeUndefined();
  });

  it('carries nome e whatsapp, which the member export never does', async () => {
    pageExpiringPrayers.mockResolvedValueOnce([prayer(1, '2025-09-01T00:00:00Z')]).mockResolvedValue([]);
    const parsed = JSON.parse(await (await call()).text());
    expect(parsed.pedidos_de_oracao).toHaveLength(1);
    expect(parsed.pedidos_de_oracao[0]).toEqual({
      quando: '2025-09-01T00:00:00.000Z',
      situacao: 'novo',
      texto: 'pedido 1',
      nome: 'Dona Cida',
      whatsapp: '5511111111111',
    });
  });

  it('closes as valid JSON with aviso AND continuacao when the ceiling is hit', async () => {
    pageExpiringPrayers.mockResolvedValue(
      Array.from({ length: 1000 }, (_, i) => prayer(i, '2025-09-01T00:00:00Z')),
    );
    const parsed = JSON.parse(await (await call()).text());
    expect(parsed.aviso).toContain('01/09/2025');
    expect(parsed.continuacao).toMatch(/^oracoes:2025-09-01T00:00:00\.000Z,/);
  });
});

describe('backpressure', () => {
  it('does not produce the file ahead of the consumer', async () => {
    // Fails against a start()-based version, which reaches ROW_CEILING / PAGE_SIZE
    // = 50 loads before the first setTimeout fires.
    pageExpiringPrayers.mockResolvedValue(
      Array.from({ length: 1000 }, (_, i) => prayer(i, '2025-09-01T00:00:00Z')),
    );
    const reader = (await call()).body!.getReader();
    await reader.read();
    await settle();
    expect(pageExpiringPrayers.mock.calls.length).toBeLessThanOrEqual(1);
    await reader.cancel();
  });

  it('stays valid JSON when the consumer reads one chunk at a time, across page boundaries', async () => {
    const all = Array.from({ length: 2500 }, (_, i) =>
      prayer(i, new Date(Date.parse('2025-09-01T00:00:00Z') + i * 1000).toISOString()));
    pageExpiringPrayers.mockImplementation(async (_c, _b, after, limit) => {
      const start = after ? all.findIndex((r) => r.id === after.id) + 1 : 0;
      return all.slice(start, start + limit);
    });

    const reader = (await call()).body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();

    expect(text).not.toContain('[,');
    expect(text).not.toContain('}{');
    const parsed = JSON.parse(text);
    expect(parsed.pedidos_de_oracao).toHaveLength(2500);
    expect(parsed.aviso).toBeUndefined();
    expect(pageExpiringPrayers).toHaveBeenCalledTimes(3);
  });
});
