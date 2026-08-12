import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// vi.mock factories are hoisted above every import AND above any top-level
// `const`, so a factory that closes over a plain `const x = vi.fn()` throws
// "Cannot access 'x' before initialization" — the mock runs before the const
// is ever assigned. vi.hoisted() is itself hoisted alongside the mocks, so its
// return value exists by the time the factories below execute. Same pattern as
// tests/member-data-actions.test.ts.
const h = vi.hoisted(() => ({
  checkDataRightsSession: vi.fn(),
  loadMemberSubject: vi.fn(),
  countMemberRows: vi.fn(),
  pageMessages: vi.fn(),
  pagePrayers: vi.fn(),
  getChurchById: vi.fn(),
}));

vi.mock('@/lib/auth/writable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/writable')>('@/lib/auth/writable');
  return { ...actual, checkDataRightsSession: h.checkDataRightsSession };
});
vi.mock('@/lib/repo/member-data', () => ({
  loadMemberSubject: h.loadMemberSubject,
  countMemberRows: h.countMemberRows,
  pageMessages: h.pageMessages,
  pagePrayers: h.pagePrayers,
}));
vi.mock('@/lib/repo/church-admin', () => ({ getChurchById: h.getChurchById }));

import { GET } from '@/app/api/dados/[contactId]/route';

const {
  checkDataRightsSession, loadMemberSubject, countMemberRows, pageMessages, pagePrayers, getChurchById,
} = h;

const ROUTE = join(process.cwd(), 'src/app/api/dados/[contactId]/route.ts');
const CONTACT = {
  id: 'ct1', name: 'Maria', phone: '5511999998888', mode: 'bot',
  lastInboundAt: new Date('2026-08-01T13:40:00Z'), createdAt: new Date('2026-01-04T18:22:00Z'),
};

function msg(i: number, at: string) {
  return { id: `m${i}`, waMessageId: `wamid.${i}`, direction: 'inbound' as const, body: `msg ${i}`, createdAt: new Date(at) };
}

/** parseCursor requires a 36-char UUID-shaped id — the same shape a real
 *  defaultRandom() row id has. msg()'s short "m<i>" ids are fine everywhere
 *  except a round-trip test that feeds the route's own `continuacao` back into
 *  a second request: there, the id has to survive re-parsing. */
function uuidFor(i: number): string {
  return `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
}

async function call(url = 'https://x/api/dados/ct1'): Promise<Response> {
  return GET(new Request(url), { params: Promise.resolve({ contactId: 'ct1' }) });
}

/** Cross a MACROTASK boundary, three times over. This is the whole discriminating
 *  power of the backpressure test below: an eager producer that only ever awaits
 *  already-resolved promises is a pure microtask chain, and the microtask queue
 *  drains completely before the first setTimeout fires. So one `settle()` is
 *  enough to let a runaway producer run to its ceiling — and a demand-driven one
 *  cannot advance at all, because nothing read. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  checkDataRightsSession.mockResolvedValue({ adminUserId: 'a1', churchId: 'c1', name: 'Secretária' });
  loadMemberSubject.mockResolvedValue(CONTACT);
  countMemberRows.mockResolvedValue({ messages: 2, prayers: 1, prayersNovo: 0 });
  getChurchById.mockResolvedValue({ id: 'c1', name: 'Igreja Exemplo' });
  pageMessages.mockResolvedValue([]);
  pagePrayers.mockResolvedValue([]);
});

describe('route declarations', () => {
  it('declares maxDuration 60 and force-dynamic', () => {
    // Without maxDuration the platform kills this at 10 s on the Hobby plan and
    // the whole 45 s bounding design never runs.
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/export\s+const\s+maxDuration\s*=\s*60/);
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*'force-dynamic'/);
  });
});

describe('headers and isolation', () => {
  it('serves JSON as an attachment whose filename carries no phone or name', async () => {
    const res = await call();
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cd = res.headers.get('content-disposition')!;
    expect(cd).toContain('dados-membro-');
    // It lands in a shared secretariat's Downloads folder.
    expect(cd).not.toContain('5511999998888');
    expect(cd).not.toContain('Maria');
  });

  it('404s for another church\'s contactId', async () => {
    loadMemberSubject.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Conversa não encontrada.' });
  });

  it('401s with no session, without leaking a redirect', async () => {
    checkDataRightsSession.mockResolvedValue({ blocked: 'unauthenticated' });
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('NEXT_REDIRECT');
  });
});

describe('the body', () => {
  it('streams header, messages, prayers and footer as one valid JSON document', async () => {
    pageMessages.mockResolvedValueOnce([msg(1, '2026-01-04T18:22:00Z'), msg(2, '2026-01-04T18:22:01Z')]).mockResolvedValue([]);
    pagePrayers.mockResolvedValueOnce([{ id: 'p1', status: 'orado' as const, text: 'ore', createdAt: new Date('2026-03-02T20:10:00Z') }]).mockResolvedValue([]);

    const parsed = JSON.parse(await (await call()).text());
    expect(parsed.igreja).toBe('Igreja Exemplo');
    expect(parsed.titular.whatsapp).toBe('5511999998888');
    expect(parsed.mensagens).toHaveLength(2);
    expect(parsed.mensagens[0]).toEqual({ quando: '2026-01-04T18:22:00.000Z', de: 'membro', texto: 'msg 1' });
    expect(parsed.pedidos_de_oracao).toHaveLength(1);
    expect(parsed.compartilhamento.join(' ')).toContain('WhatsApp');
    expect(parsed.aviso).toBeUndefined();
  });

  it('never emits wa_message_id or internal UUIDs', async () => {
    pageMessages.mockResolvedValueOnce([msg(1, '2026-01-04T18:22:00Z')]).mockResolvedValue([]);
    const text = await (await call()).text();
    expect(text).not.toContain('wamid');
    expect(text).not.toContain('"m1"');
  });
});

describe('truncation', () => {
  it('closes as valid JSON with aviso AND continuacao when the ceiling is hit', async () => {
    // Forced by making every page full, so the row ceiling is what stops it.
    const full = Array.from({ length: 1000 }, (_, i) => msg(i, '2026-03-12T19:04:11.208Z'));
    pageMessages.mockResolvedValue(full);

    const parsed = JSON.parse(await (await call()).text());
    expect(parsed.aviso).toContain('12/03/2026');
    expect(parsed.continuacao).toMatch(/^mensagens:2026-03-12T19:04:11\.208Z,/);
    // Both keys or neither: a file saying data is missing with no way to fetch it
    // would be a dead end.
    expect(parsed.continuacao).toBeDefined();
  });

  it('resuming into pedidos_de_oracao skips mensagens entirely, and can truncate again there', async () => {
    // The other truncation seam: a request that resumes with an oracoes: cursor
    // (a second file, continuing a prayers export that was itself cut off) must
    // skip mensagens without calling pageMessages at all — `skip` short-circuits
    // drain() before its first `load()` — and the prayers array must survive the
    // exact same first/comma/ceiling logic messages does, driven by an
    // independent `first` because it is a separate drain() call/generator frame.
    const full = Array.from({ length: 1000 }, (_, i) => ({
      id: uuidFor(i), status: 'orado' as const, text: `ore ${i}`, createdAt: new Date('2026-04-05T09:00:00.000Z'),
    }));
    pagePrayers.mockResolvedValue(full);

    const text = await (await call(
      'https://x/api/dados/ct1?apos=oracoes:2026-04-01T00:00:00.000Z,7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77',
    )).text();

    expect(text).not.toContain('[,');
    expect(text).not.toContain('}{');
    const parsed = JSON.parse(text);
    expect(pageMessages).not.toHaveBeenCalled();
    expect(parsed.mensagens).toEqual([]);
    expect(parsed.pedidos_de_oracao).toHaveLength(50_000);
    expect(parsed.continuacao).toMatch(/^oracoes:2026-04-05T09:00:00\.000Z,/);
    expect(pagePrayers).toHaveBeenCalledWith(
      'c1', 'ct1',
      { createdAt: new Date('2026-04-01T00:00:00.000Z'), id: '7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77' },
      expect.any(Number),
    );
  });

  it('resumes from ?apos= with no overlap and no gap', async () => {
    pageMessages.mockResolvedValue([]);
    pagePrayers.mockResolvedValue([]);
    // The brief's draft of this test called `call()` and asserted on the mock
    // immediately, without ever reading the body. Against a true pull()-driven
    // stream with highWaterMark: 1, that assertion can never see pageMessages
    // called: only the FIRST header chunk is ever produced without a consumer
    // (the queue fills to its one-chunk capacity and pull() is not invoked again
    // until something reads), and the "mensagens" collection opens several
    // chunks later. Consuming the body is what makes this test exercise the
    // route at all rather than just its synchronous preamble.
    await (await call('https://x/api/dados/ct1?apos=mensagens:2026-03-12T19:04:11.208Z,7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77')).text();

    expect(pageMessages).toHaveBeenCalledWith(
      'c1', 'ct1',
      { createdAt: new Date('2026-03-12T19:04:11.208Z'), id: '7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77' },
      expect.any(Number),
    );
  });

  it('ignores a malformed cursor rather than 500ing', async () => {
    const res = await call('https://x/api/dados/ct1?apos=lixo');
    expect(res.status).toBe(200);
    // Same fix as above: drive the stream to completion so pageMessages is
    // actually reached before asserting on it.
    await res.text();
    expect(pageMessages).toHaveBeenCalledWith('c1', 'ct1', null, expect.any(Number));
  });
});

describe('backpressure', () => {
  it('does not produce the document ahead of the consumer', async () => {
    // ⚠ THIS IS THE TEST THAT FAILS AGAINST THE start()-BASED VERSION. Every page
    // the mock can serve is full, so nothing but the ceiling stops an eager
    // producer: measured against the old code it reaches 50 loads (ROW_CEILING /
    // PAGE_SIZE) before the first setTimeout fires. The pull() version has not
    // called the loader at ALL by this point — the header alone is more chunks
    // than a highWaterMark of 1 will take.
    pageMessages.mockResolvedValue(Array.from({ length: 1000 }, (_, i) => msg(i, '2026-03-12T19:04:11.208Z')));

    const reader = (await call()).body!.getReader();
    await reader.read();
    await settle();

    // ≤ 1 rather than 0: the assertion is "the producer stays within a page of the
    // reader", not "the header is exactly this many chunks". 50 fails it either way.
    expect(pageMessages.mock.calls.length).toBeLessThanOrEqual(1);
    await reader.cancel();
  });

  it('stays valid JSON when the consumer reads one chunk at a time, across page boundaries', async () => {
    // The comma hazard exercised where it lives. 2 500 rows is three pages, the
    // last short, so `first` has to survive suspension BETWEEN rows and BETWEEN
    // pages — and every chunk boundary here is a real pull() boundary, because the
    // reader takes exactly one chunk per turn.
    const all = Array.from({ length: 2500 }, (_, i) =>
      msg(i, new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000).toISOString()));
    pageMessages.mockImplementation(async (_c, _ct, after, limit) => {
      const start = after ? all.findIndex((r) => r.id === after.id) + 1 : 0;
      return all.slice(start, start + limit);
    });
    countMemberRows.mockResolvedValue({ messages: 2500, prayers: 0, prayersNovo: 0 });

    const reader = (await call()).body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();

    // The two shapes a lost or doubled `first` produces, named rather than left to
    // JSON.parse: an array opening on a comma, and two rows with nothing between
    // them. Neither can occur legitimately anywhere in this document.
    expect(text).not.toContain('[,');
    expect(text).not.toContain('}{');

    const parsed = JSON.parse(text);
    expect(parsed.mensagens).toHaveLength(2500);
    expect(parsed.mensagens[0].texto).toBe('msg 0');
    expect(parsed.mensagens[2499].texto).toBe('msg 2499');
    expect(parsed.aviso).toBeUndefined();
    // 1 000 + 1 000 + 500: three pages and not one row fetched ahead of need.
    expect(pageMessages).toHaveBeenCalledTimes(3);
  });
});

describe('the continuation is exact', () => {
  it('two files union to every message exactly once, including a millisecond tie', async () => {
    // The brief's draft of this test used 2 500 rows and expected the ROW_CEILING
    // (50 000) to truncate them — it never could at that scale, so this fixture
    // is sized to cross the ceiling for real: the SAME mechanism the "closes as
    // valid JSON with aviso AND continuacao when the ceiling is hit" test above
    // already proves in isolation, now exercised end-to-end with a genuine
    // resume. The tie is placed to straddle the resulting page boundary (rows
    // 49 995-50 004, all timestamped alike) so the truncation cursor itself
    // lands on a tied row — the exact case a date cursor cannot split in either
    // direction, and the (created_at, id) cursor can.
    const TOTAL = 50_500;
    const TIE = '2026-03-12T19:04:11.208Z';
    const all = Array.from({ length: TOTAL }, (_, i) => ({
      ...msg(i, i >= 49_995 && i < 50_005 ? TIE : new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000).toISOString()),
      id: uuidFor(i),
    }));

    // Serve keyset pages out of the fixture, exactly as the repo would.
    pageMessages.mockImplementation(async (_c, _ct, after, limit) => {
      const start = after
        ? all.findIndex((m) => m.createdAt.getTime() === after.createdAt.getTime() && m.id === after.id) + 1
        : 0;
      return all.slice(start, start + limit);
    });
    countMemberRows.mockResolvedValue({ messages: TOTAL, prayers: 0, prayersNovo: 0 });

    const first = JSON.parse(await (await call()).text());
    expect(first.continuacao).toBeDefined();
    expect(first.mensagens).toHaveLength(50_000);

    const second = JSON.parse(await (await call(
      `https://x/api/dados/ct1?apos=${encodeURIComponent(first.continuacao)}`,
    )).text());

    const union = [...first.mensagens, ...second.mensagens];
    // No gap: every message present. No overlap: none of them twice.
    expect(union).toHaveLength(TOTAL);
    expect(new Set(union.map((m: { texto: string }) => m.texto)).size).toBe(TOTAL);
  });
});
