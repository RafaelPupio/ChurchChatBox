import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__memberDataClient = client;
  return { db: drizzle(client, { schema }) };
});

import {
  countMemberRows,
  deleteMember,
  loadMemberSubject,
  pageMessages,
  pagePrayers,
  renameContact,
} from '@/lib/repo/member-data';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
let client: PGlite;
let churchId: string;
let contactId: string;

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__memberDataClient as PGlite;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }

  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
       unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ('Igreja Dados','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
  );
  churchId = c.rows[0].id;
  const ct = await client.query<{ id: string }>(
    `insert into contact (church_id,phone,name,last_inbound_at,created_at)
     values ($1,'5511999998888','Maria','2026-08-01T13:40:00Z','2026-01-04T18:22:00Z') returning id`,
    [churchId],
  );
  contactId = ct.rows[0].id;

  // Three messages a second apart, plus two sharing one created_at to the
  // millisecond — the case a date cursor cannot split.
  await client.query(
    `insert into message (church_id,contact_id,direction,body,created_at) values
      ($1,$2,'inbound','primeira','2026-01-04T18:22:00.000Z'),
      ($1,$2,'outbound','segunda','2026-01-04T18:22:01.000Z'),
      ($1,$2,'inbound','terceira','2026-01-04T18:22:02.000Z'),
      ($1,$2,'inbound','empate A','2026-02-01T10:00:00.000Z'),
      ($1,$2,'inbound','empate B','2026-02-01T10:00:00.000Z')`,
    [churchId, contactId],
  );
  await client.query(
    `insert into prayer_request (church_id,contact_id,text,status,created_at) values
      ($1,$2,'ore por minha mãe','novo','2026-03-02T20:10:00Z'),
      ($1,$2,'ore pelo meu filho','orado','2026-03-03T20:10:00Z')`,
    [churchId, contactId],
  );
});

describe('loadMemberSubject', () => {
  it('returns the contact for its own church', async () => {
    const s = await loadMemberSubject(churchId, contactId);
    expect(s).not.toBeNull();
    expect(s!.name).toBe('Maria');
    expect(s!.phone).toBe('5511999998888');
  });

  it('returns null for a contactId that does not exist', async () => {
    expect(await loadMemberSubject(churchId, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('countMemberRows', () => {
  it('counts messages, prayers, and prayers still marked novo separately', async () => {
    // prayersNovo drives a warning the secretary must see before deleting: the
    // church is about to lose prayers it has not yet prayed for.
    expect(await countMemberRows(churchId, contactId)).toEqual({
      messages: 5, prayers: 2, prayersNovo: 1,
    });
  });

  it('returns zeros rather than throwing for an unknown contact', async () => {
    expect(await countMemberRows(churchId, '00000000-0000-0000-0000-000000000000'))
      .toEqual({ messages: 0, prayers: 0, prayersNovo: 0 });
  });
});

describe('pageMessages', () => {
  it('pages ascending by (created_at, id) and never repeats a row', async () => {
    const first = await pageMessages(churchId, contactId, null, 2);
    expect(first.map((m) => m.body)).toEqual(['primeira', 'segunda']);

    const second = await pageMessages(
      churchId, contactId,
      { createdAt: first[1].createdAt, id: first[1].id },
      2,
    );
    // 'terceira' has a createdAt strictly between 'segunda' and the tied pair, so
    // it is always next regardless of id. Which of 'empate A' / 'empate B' follows
    // it depends on their id — gen_random_uuid(), not insertion order — so
    // asserting a specific label here would pin the test to a coin flip rather
    // than to the paging contract. What the contract promises is: exactly one of
    // the tied pair, and neither row already handed out in `first`.
    expect(second[0].body).toBe('terceira');
    expect(second[1].body).toMatch(/^empate /);
    const firstIds = first.map((m) => m.id);
    expect(second.map((m) => m.id)).not.toEqual(expect.arrayContaining(firstIds));
  });

  it('splits rows that share a created_at to the millisecond', async () => {
    // The whole reason the cursor is (created_at, id) and not a date: resuming at
    // >= a timestamp re-exports the tie, resuming at > skips it. There is no third
    // option, so a date cursor cannot be both gapless and overlap-free.
    const all = await pageMessages(churchId, contactId, null, 100);
    const tied = all.filter((m) => m.body?.startsWith('empate'));
    expect(tied).toHaveLength(2);

    const afterFirstTie = await pageMessages(
      churchId, contactId,
      { createdAt: tied[0].createdAt, id: tied[0].id },
      100,
    );
    // Exactly the OTHER tied row: not zero (a `>` on created_at alone would skip
    // it), not both again (a `>=` on created_at alone would re-export tied[0]).
    // Which literal label that is depends on the pair's random ids, so the
    // expectation is built from the query's own first tied row, not hardcoded.
    expect(afterFirstTie.map((m) => m.body)).toEqual([tied[1].body]);
  });

  it('returns the rows the export builder needs and nothing extra', async () => {
    const [row] = await pageMessages(churchId, contactId, null, 1);
    expect(Object.keys(row).sort()).toEqual(['body', 'createdAt', 'direction', 'id', 'waMessageId']);
  });
});

describe('pagePrayers', () => {
  it('pages ascending and carries status', async () => {
    const rows = await pagePrayers(churchId, contactId, null, 10);
    expect(rows.map((p) => p.status)).toEqual(['novo', 'orado']);
  });
});

describe('renameContact', () => {
  it('renames within the church and reports one row', async () => {
    expect(await renameContact(churchId, contactId, 'Maria de Souza')).toBe(1);
    expect((await loadMemberSubject(churchId, contactId))!.name).toBe('Maria de Souza');
  });
});

describe('deleteMember', () => {
  it('deletes the contact and cascades messages and prayers in ONE statement', async () => {
    // neon-http has no transactions. A multi-table delete could not be made
    // atomic, so there is no multi-table delete: one DELETE FROM contact runs in
    // Postgres's implicit per-statement transaction and the FK cascades do the
    // rest. A half-deleted member is designed out, not compensated for.
    expect(await deleteMember(churchId, contactId)).toBe(1);

    for (const table of ['contact', 'message', 'prayer_request']) {
      const r = await client.query<{ n: string }>(
        `select count(*) as n from ${table} where church_id = $1`, [churchId],
      );
      expect(Number(r.rows[0].n), `${table} should be empty`).toBe(0);
    }
  });

  it('is idempotent — a second delete reports zero rows', async () => {
    expect(await deleteMember(churchId, contactId)).toBe(0);
  });
});
