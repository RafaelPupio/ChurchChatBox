import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeErasureRecord } from '@/lib/erasure-copy';

const base = {
  id: 'r1', subjectContactId: null, subjectPhoneHash: null, performedByEmail: null,
  completedAt: new Date('2026-08-07T07:00:00Z'), createdAt: new Date('2026-08-07T06:00:00Z'),
};

describe('describeErasureRecord', () => {
  it('renders a completed retention run with its three counts', () => {
    expect(describeErasureRecord({
      ...base, reason: 'retention', status: 'done',
      messagesDeleted: 1240, prayersDeleted: 12, contactsDeleted: 3,
    })).toBe('07/08/2026 · Limpeza automática (12 meses) · 1240 mensagens, 12 pedidos de oração, 3 cadastros apagados');
  });

  it('renders an ALL-ZERO done retention row as interrupted, and never hides it', () => {
    // The row that exists because 500 message bodies can be destroyed while the
    // counter update never lands. Hiding it is how that becomes invisible.
    expect(describeErasureRecord({
      ...base, reason: 'retention', status: 'done',
      messagesDeleted: 0, prayersDeleted: 0, contactsDeleted: 0,
    })).toBe('07/08/2026 · Limpeza automática (12 meses) · a execução foi interrompida antes de registrar a contagem');
  });

  it('renders a subject request with the acting staff email', () => {
    expect(describeErasureRecord({
      ...base, reason: 'subject_request', status: 'done', performedByEmail: 'secretaria@igreja.org',
      messagesDeleted: 412, prayersDeleted: 3, contactsDeleted: 1,
    })).toBe('07/08/2026 · Pedido do titular · 412 mensagens, 3 pedidos de oração · por secretaria@igreja.org');
  });

  it('appends the pending suffix', () => {
    expect(describeErasureRecord({
      ...base, reason: 'retention', status: 'pending',
      messagesDeleted: 500, prayersDeleted: 0, contactsDeleted: 0,
    })).toContain(' · pendente');
  });

  it('does NOT call a pending all-zero row interrupted — it may still be running', () => {
    const line = describeErasureRecord({
      ...base, reason: 'retention', status: 'pending',
      messagesDeleted: 0, prayersDeleted: 0, contactsDeleted: 0,
    });
    expect(line).not.toContain('interrompida');
    expect(line).toContain(' · pendente');
  });
});

/** The page under test never renders in this file — it is a Server Component
 *  that awaits requireReadableSession, getChurchById, listAdmins and
 *  countExpiringPrayers before it ever reaches the erasure records, which would
 *  turn "does the page hide an all-zero row" into a heavy mock of four unrelated
 *  repos just to observe one `.map()` call.
 *
 *  So this reads page.tsx's own SOURCE instead — the same technique
 *  tests/privilege-boundary.test.ts uses to enforce the platform-repo import
 *  boundary. describeErasureRecord's own tests above already prove the pure
 *  function renders an all-zero DONE row as "interrompida" rather than hiding
 *  it; what those tests cannot see is whether the PAGE actually calls that
 *  function on every row it fetches. A `.filter()` slipped in between the fetch
 *  and the map would drop the row silently, and none of the tests above would
 *  notice, because none of them import this file. */
const PAGE_PATH = join(process.cwd(), 'src/app/admin/(protected)/configuracoes/page.tsx');

describe('the display rule: no filter', () => {
  it('page.tsx maps every fetched erasure record through describeErasureRecord, with nothing in between', () => {
    // A reviewer proved the failure mode this guards: adding a `.filter()` right
    // here — hiding all-zero rows — made an interrupted purge that destroyed 500
    // message bodies show the church NO LINE AT ALL, and the whole suite (958
    // tests) stayed green, because the old version of this test built its own
    // array and mapped it in the test body instead of reading the page.
    const src = readFileSync(PAGE_PATH, 'utf8');

    const fetchIdx = src.indexOf('listErasureRecords(');
    expect(fetchIdx, 'page.tsx must still fetch the records via listErasureRecords').toBeGreaterThan(-1);

    const mapIdx = src.indexOf('describeErasureRecord', fetchIdx);
    expect(mapIdx, 'page.tsx must still map the fetched records through describeErasureRecord').toBeGreaterThan(-1);

    // Everything textually between the fetch and the map — a `.filter(...)`, a
    // `.slice(...)`, a conditional reassignment of `records` — is exactly what
    // would make a row disappear before describeErasureRecord ever sees it.
    const between = src.slice(fetchIdx, mapIdx);
    expect(between).not.toMatch(/\.filter\(/);
  });

  it('an all-zero done row is rendered as interrupted, never hidden — the rule describeErasureRecord itself enforces', () => {
    // Belt-and-suspenders with the describeErasureRecord suite above: even if a
    // future page reads records through a helper rather than a literal
    // `.map(describeErasureRecord)`, the underlying rule must still hold at the
    // one function every rendering path funnels through.
    const rows = [
      { ...base, reason: 'retention' as const, status: 'done' as const,
        messagesDeleted: 0, prayersDeleted: 0, contactsDeleted: 0 },
      { ...base, reason: 'retention' as const, status: 'done' as const,
        messagesDeleted: 1240, prayersDeleted: 12, contactsDeleted: 3 },
    ];
    const lines = rows.map(describeErasureRecord);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('interrompida');
  });
});
