import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__retentionClient = client;
  return { db: drizzle(client, { schema }) };
});

import {
  addRetentionCounts,
  completeErasureRecordSystem,
  hasPurgeWork,
  interpretWorkFlag,
  listChurchIdsForPurge,
  listStalePendingErasures,
  markChurchPurged,
  openRetentionRecord,
  purgeContactBatch,
  purgeMessageBatch,
  purgePrayerBatch,
  sweepStaleRetentionRecords,
} from '@/lib/repo/retention';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
const NOW = new Date('2026-08-11T06:00:00.000Z');
const CUTOFF = new Date('2025-08-11T06:00:00.000Z');   // NOW - 365d
const OLD = '2025-01-01T00:00:00Z';                    // past the cutoff
const RECENT = '2026-08-01T00:00:00Z';                 // inside retention

let client: PGlite;

async function migrate(): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
}

async function makeChurch(name: string): Promise<string> {
  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
       unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,'oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`, [name],
  );
  return c.rows[0].id;
}

async function makeContact(churchId: string, phone: string, lastInbound: string | null): Promise<string> {
  const ct = await client.query<{ id: string }>(
    `insert into contact (church_id,phone,last_inbound_at,created_at) values ($1,$2,$3,$4) returning id`,
    [churchId, phone, lastInbound, lastInbound ?? OLD],
  );
  return ct.rows[0].id;
}

async function addMessages(churchId: string, contactId: string, n: number, at: string): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await client.query(
      `insert into message (church_id,contact_id,direction,body,created_at) values ($1,$2,'inbound',$3,$4)`,
      [churchId, contactId, `msg ${i}`, at],
    );
  }
}

async function countRows(table: string, churchId: string): Promise<number> {
  const r = await client.query<{ n: string }>(
    `select count(*) as n from ${table} where church_id = $1`, [churchId],
  );
  return Number(r.rows[0].n);
}

beforeEach(async () => {
  client = (globalThis as Record<string, unknown>).__retentionClient as PGlite;
  // Fresh schema per test: the purge is destructive and order-dependent.
  await client.exec(`drop schema public cascade; create schema public;`);
  await client.exec(`drop schema if exists drizzle cascade;`);
  await migrate();
});

describe('the counting model', () => {
  it('reports EVERY deleted row — a cascade never fires during a purge', async () => {
    // The regression this whole ordering exists for. Three idle contacts holding
    // 900 messages, plus 340 old messages belonging to still-active members. The
    // naive ordering (contacts first, cascade takes the rest) reports 340.
    const churchId = await makeChurch('Igreja Contagem');

    for (let i = 0; i < 3; i += 1) {
      const idle = await makeContact(churchId, `55110000000${i}`, OLD);
      await addMessages(churchId, idle, 300, OLD);
    }
    const active = await makeContact(churchId, '5511999999999', RECENT);
    await addMessages(churchId, active, 340, OLD);

    let messages = 0;
    let contacts = 0;
    let batch = 0;
    do {
      batch = await purgeMessageBatch(churchId, CUTOFF, 500);
      messages += batch;
    } while (batch === 500);
    do {
      batch = await purgeContactBatch(churchId, CUTOFF, 500);
      contacts += batch;
    } while (batch === 500);

    expect(messages).toBe(1240);
    expect(contacts).toBe(3);
    // The active member survives, having had all their old messages removed.
    expect(await countRows('contact', churchId)).toBe(1);
    expect(await countRows('message', churchId)).toBe(0);
  });

  it('a contact that still owns a message is NOT deleted — the NOT EXISTS guard', async () => {
    // The mid-purge race: the webhook inserts a message one statement before it
    // touches last_inbound_at, so an idle contact can acquire a child between the
    // child sweep and the parent sweep. It must survive to the next run rather
    // than have the new message silently cascaded away.
    const churchId = await makeChurch('Igreja Corrida');
    const idle = await makeContact(churchId, '5511000000000', OLD);
    await addMessages(churchId, idle, 1, RECENT);   // arrived just now

    expect(await purgeContactBatch(churchId, CUTOFF, 500)).toBe(0);
    expect(await countRows('contact', churchId)).toBe(1);
    expect(await countRows('message', churchId)).toBe(1);
  });

  it('purges prayer requests on the same clock as messages — no exemption', async () => {
    // Settled by the owner: the argument for keeping prayers longest is the same
    // argument for keeping them least. They carry health, family and faith detail.
    const churchId = await makeChurch('Igreja Oração');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    await client.query(
      `insert into prayer_request (church_id,contact_id,text,created_at) values
        ($1,$2,'antiga',$3), ($1,$2,'recente',$4)`,
      [churchId, ct, OLD, RECENT],
    );
    expect(await purgePrayerBatch(churchId, CUTOFF, 500)).toBe(1);
    expect(await countRows('prayer_request', churchId)).toBe(1);
  });

  it('leaves the church row, its texts and its menu untouched', async () => {
    const churchId = await makeChurch('Igreja Preservada');
    await client.query(
      `insert into menu_item (church_id,position,label,body_text) values ($1,1,'Horários','corpo')`,
      [churchId],
    );
    const idle = await makeContact(churchId, '5511000000000', OLD);
    await addMessages(churchId, idle, 5, OLD);

    await purgeMessageBatch(churchId, CUTOFF, 500);
    await purgeContactBatch(churchId, CUTOFF, 500);

    expect(await countRows('menu_item', churchId)).toBe(1);
    const ch = await client.query<{ name: string }>(`select name from church where id = $1`, [churchId]);
    expect(ch.rows[0].name).toBe('Igreja Preservada');
  });
});

describe('isolation and convergence', () => {
  it('never touches another church, and a second run deletes nothing', async () => {
    const a = await makeChurch('Igreja A');
    const b = await makeChurch('Igreja B');
    for (const id of [a, b]) {
      const ct = await makeContact(id, `5511${id.slice(0, 6)}`, OLD);
      await addMessages(id, ct, 10, OLD);
    }

    await purgeMessageBatch(a, CUTOFF, 500);
    await purgeContactBatch(a, CUTOFF, 500);

    expect(await countRows('message', a)).toBe(0);
    expect(await countRows('message', b)).toBe(10);
    expect(await countRows('contact', b)).toBe(1);

    // Idempotent: the predicate is absolute time, not a cursor.
    expect(await purgeMessageBatch(a, CUTOFF, 500)).toBe(0);
    expect(await purgeContactBatch(a, CUTOFF, 500)).toBe(0);
  });

  it('converges with a batch limit of 1', async () => {
    const churchId = await makeChurch('Igreja Lenta');
    const ct = await makeContact(churchId, '5511000000000', OLD);
    await addMessages(churchId, ct, 5, OLD);

    let guard = 0;
    while (await purgeMessageBatch(churchId, CUTOFF, 1)) { guard += 1; expect(guard).toBeLessThan(50); }
    expect(await countRows('message', churchId)).toBe(0);
  });

  it('ages out a contact whose last_inbound_at is NULL, via created_at', async () => {
    // last_inbound_at is written by a SEPARATE statement from the contact insert,
    // and neon-http has no transactions — so a real row can legitimately have a
    // null here. Coalescing to created_at (NOT NULL) means it still ages out
    // instead of living forever.
    const churchId = await makeChurch('Igreja Nula');
    await makeContact(churchId, '5511000000000', null);
    expect(await purgeContactBatch(churchId, CUTOFF, 500)).toBe(1);
  });
});

describe('hasPurgeWork', () => {
  it('is false for a church with nothing past the cutoff', async () => {
    const churchId = await makeChurch('Igreja Nova');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    await addMessages(churchId, ct, 3, RECENT);
    expect(await hasPurgeWork(churchId, CUTOFF)).toBe(false);
  });

  it('is true when any of the three has work', async () => {
    const churchId = await makeChurch('Igreja Com Trabalho');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    await addMessages(churchId, ct, 1, OLD);
    expect(await hasPurgeWork(churchId, CUTOFF)).toBe(true);
  });
});

describe('interpretWorkFlag — which way this probe fails', () => {
  // The two tests above run on PGlite, which returns a real JS boolean. neon-http
  // is not exercisable from here at all, and Postgres's own wire form for a boolean
  // is the text 't'/'f' — on which `=== true` is false (right by accident) and a
  // truthiness test is TRUE for 'f' (wrong). Neither naive form is safe on a value
  // whose type is unverified, so the shapes get named.
  it('reads the two real booleans', () => {
    expect(interpretWorkFlag('c1', true)).toBe(true);
    expect(interpretWorkFlag('c1', false)).toBe(false);
  });

  it('reads the text and numeric spellings a driver without a bool parser produces', () => {
    for (const yes of ['t', 'true', 'TRUE', 1, '1']) expect(interpretWorkFlag('c1', yes)).toBe(true);
    for (const no of ['f', 'false', 'FALSE', 0, '0']) expect(interpretWorkFlag('c1', no)).toBe(false);
  });

  it('assumes WORK EXISTS for any shape it does not recognise', () => {
    // The asymmetry is the whole point. A wrong `false` means this church is never
    // purged — every night, forever, invisibly — and its members' data lives past
    // 12 months. A wrong `true` means an all-zero receipt, which is noise a human
    // notices. Only a value positively recognised as "no work" may return false.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const weird of [undefined, null, 'sim', 'nao', 2, {}, []]) {
      expect(interpretWorkFlag('c1', weird)).toBe(true);
    }
    spy.mockRestore();
  });

  it('says so operator-side rather than guessing quietly', () => {
    // English, like every other operator-facing line (C1). A guess nobody can see
    // is how a shape defect survives a year.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    interpretWorkFlag('c1', undefined);
    expect(spy).toHaveBeenCalledTimes(1);
    interpretWorkFlag('c1', true);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('fairness across churches', () => {
  it('orders least-recently-purged first, with never-purged at the front', async () => {
    const never = await makeChurch('Nunca');
    const old = await makeChurch('Antiga');
    const recent = await makeChurch('Recente');
    await markChurchPurged(old, new Date('2026-08-01T06:00:00Z'));
    await markChurchPurged(recent, new Date('2026-08-10T06:00:00Z'));

    expect(await listChurchIdsForPurge(10)).toEqual([never, old, recent]);
  });

  it('advances the cursor even for a church whose slice was cut short', async () => {
    // This is what makes the rotation a rotation. A church with a million rows
    // takes its slice, moves to the back of the queue, and the rest of the
    // platform gets purged tomorrow instead of never.
    const a = await makeChurch('Grande');
    const b = await makeChurch('Pequena');

    // NOT toEqual([a, b]) on two never-purged churches. Both cursors are NULL, so
    // the order falls entirely to the `asc(church.id)` tiebreak — and church.id is
    // gen_random_uuid(). Measured on PGlite over 200 trials, insertion order held
    // 54% of the time: an assertion on it is a coin flip that fails half of all
    // runs. Compare the SET while nothing distinguishes them, then assert the
    // ORDER once the cursor actually does.
    expect((await listChurchIdsForPurge(10)).slice().sort()).toEqual([a, b].slice().sort());

    await markChurchPurged(a, NOW);
    // b is still NULL (never purged) and NULLS FIRST puts it ahead of a's real
    // timestamp. This ordering IS deterministic, because the cursors now differ.
    expect(await listChurchIdsForPurge(10)).toEqual([b, a]);
  });
});

describe('the retention receipt', () => {
  it('opens pending at 0/0/0 and accumulates per batch', async () => {
    const churchId = await makeChurch('Igreja Recibo');
    const recordId = await openRetentionRecord(churchId);

    const opened = await client.query<{ status: string; messages_deleted: number }>(
      `select status, messages_deleted from erasure_record where id = $1`, [recordId],
    );
    expect(opened.rows[0].status).toBe('pending');
    expect(Number(opened.rows[0].messages_deleted)).toBe(0);

    await addRetentionCounts(recordId, churchId, { messages: 500, prayers: 0, contacts: 0 });
    await addRetentionCounts(recordId, churchId, { messages: 240, prayers: 12, contacts: 3 });

    const after = await client.query<{ messages_deleted: number; prayers_deleted: number; contacts_deleted: number }>(
      `select messages_deleted, prayers_deleted, contacts_deleted from erasure_record where id = $1`,
      [recordId],
    );
    // All THREE counters accumulate. An earlier draft incremented messages alone,
    // which would have left every receipt reading "0 pedidos, 0 cadastros" forever
    // and fired the interrupted-run string on runs that completed normally.
    expect(Number(after.rows[0].messages_deleted)).toBe(740);
    expect(Number(after.rows[0].prayers_deleted)).toBe(12);
    expect(Number(after.rows[0].contacts_deleted)).toBe(3);
  });

  it('addRetentionCounts cannot touch another church\'s record', async () => {
    const a = await makeChurch('A');
    const b = await makeChurch('B');
    const recordId = await openRetentionRecord(a);
    await addRetentionCounts(recordId, b, { messages: 999, prayers: 0, contacts: 0 });
    const row = await client.query<{ messages_deleted: number }>(
      `select messages_deleted from erasure_record where id = $1`, [recordId],
    );
    expect(Number(row.rows[0].messages_deleted)).toBe(0);
  });
});

describe('the sweeps', () => {
  it('flips a stale pending retention row to done, keeping its counts as they stand', async () => {
    // The killed-between-DELETE-and-UPDATE case. The receipt may read 0/0/0 even
    // though 500 bodies are gone. The sweep freezes it; it never invents a number.
    const churchId = await makeChurch('Igreja Interrompida');
    const recordId = await openRetentionRecord(churchId);
    await client.query(
      `update erasure_record set created_at = $2 where id = $1`,
      [recordId, '2026-08-10T00:00:00Z'],
    );

    expect(await sweepStaleRetentionRecords(new Date('2026-08-11T00:00:00Z'))).toBe(1);
    const row = await client.query<{ status: string; messages_deleted: number; completed_at: Date | null }>(
      `select status, messages_deleted, completed_at from erasure_record where id = $1`, [recordId],
    );
    expect(row.rows[0].status).toBe('done');
    expect(Number(row.rows[0].messages_deleted)).toBe(0);
    expect(row.rows[0].completed_at).not.toBeNull();
  });

  it('does not sweep a retention row that is still fresh', async () => {
    const churchId = await makeChurch('Igreja Fresca');
    await openRetentionRecord(churchId);
    expect(await sweepStaleRetentionRecords(new Date('2020-01-01T00:00:00Z'))).toBe(0);
  });

  it('lists stale pending SUBJECT erasures for the cron to finish', async () => {
    const churchId = await makeChurch('Igreja Pendente');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    const rec = await client.query<{ id: string }>(
      `insert into erasure_record (church_id,reason,status,subject_contact_id,created_at,messages_deleted)
       values ($1,'subject_request','pending',$2,'2026-08-10T00:00:00Z',7) returning id`,
      [churchId, ct],
    );

    const stale = await listStalePendingErasures(new Date('2026-08-11T00:00:00Z'));
    expect(stale).toHaveLength(1);
    expect(stale[0]).toEqual({ id: rec.rows[0].id, churchId, subjectContactId: ct });

    await completeErasureRecordSystem(rec.rows[0].id);
    const row = await client.query<{ status: string; messages_deleted: number }>(
      `select status, messages_deleted from erasure_record where id = $1`, [rec.rows[0].id],
    );
    expect(row.rows[0].status).toBe('done');
    // The self-healed receipt keeps its REAL counts, because they were written at
    // open time. A swept record reading 0 mensagens for the one case where the
    // delete definitely happened would be worse than no receipt.
    expect(Number(row.rows[0].messages_deleted)).toBe(7);
  });

  it('does not list retention rows as stale erasures, or vice versa', async () => {
    const churchId = await makeChurch('Igreja Mista');
    await client.query(
      `insert into erasure_record (church_id,reason,status,created_at)
       values ($1,'retention','pending','2026-08-10T00:00:00Z')`, [churchId],
    );
    expect(await listStalePendingErasures(new Date('2026-08-11T00:00:00Z'))).toEqual([]);
  });
});

describe('receipt failures, in both directions', () => {
  it('UNDER-REPORTS but never over-reports when the count update is lost', async () => {
    // The killed-between-DELETE-and-UPDATE case, driven for real rather than by
    // ageing a row by hand. The rows are gone and the receipt still reads 0 — which
    // is exactly why Configurações must LIST an all-zero done row instead of
    // hiding it. The invariant is one-directional: a receipt never overstates.
    const churchId = await makeChurch('Igreja Perdida');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    await addMessages(churchId, ct, 5, OLD);

    const recordId = await openRetentionRecord(churchId);
    const deleted = await purgeMessageBatch(churchId, CUTOFF, 500);
    expect(deleted).toBe(5);
    // The +n UPDATE never happens — the function died here.

    expect(await countRows('message', churchId)).toBe(0);
    const row = await client.query<{ messages_deleted: number }>(
      `select messages_deleted from erasure_record where id = $1`, [recordId],
    );
    expect(Number(row.rows[0].messages_deleted)).toBe(0);

    await client.query(`update erasure_record set created_at = $2 where id = $1`,
      [recordId, '2026-08-10T00:00:00Z']);
    expect(await sweepStaleRetentionRecords(new Date('2026-08-11T00:00:00Z'))).toBe(1);

    const swept = await client.query<{ status: string; messages_deleted: number }>(
      `select status, messages_deleted from erasure_record where id = $1`, [recordId],
    );
    expect(swept.rows[0].status).toBe('done');
    // 0/0/0 and DONE — the exact row describeErasureRecord must render as
    // "a execução foi interrompida antes de registrar a contagem".
    expect(Number(swept.rows[0].messages_deleted)).toBe(0);
  });

  it('deletes NOTHING when the receipt cannot be opened', async () => {
    // Evidence before destruction. The reverse ordering would destroy a year of
    // message bodies with zero Art. 6 X evidence and nothing to detect it.
    const churchId = await makeChurch('Igreja Sem Recibo');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    await addMessages(churchId, ct, 5, OLD);

    // Simulate the insert failing by dropping the table the receipt goes in.
    await client.exec(`alter table erasure_record rename to erasure_record_hidden`);
    await expect(openRetentionRecord(churchId)).rejects.toThrow();
    await client.exec(`alter table erasure_record_hidden rename to erasure_record`);

    // The caller aborts this church's slice; nothing was purged.
    expect(await countRows('message', churchId)).toBe(5);
  });
});

describe('the prayer warning is a courtesy, not a gate', () => {
  it('purges expiring prayers with the export never having been called', async () => {
    // Nothing about the purge is conditional on the export: the cron does not check
    // whether a warning was shown or a file downloaded, and erasure_record has no
    // field it could check with. This test is the proof of that, and it fails the
    // day someone adds such a condition.
    const churchId = await makeChurch('Igreja Que Ignorou');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    await client.query(
      `insert into prayer_request (church_id,contact_id,text,created_at) values ($1,$2,'antiga',$3)`,
      [churchId, ct, OLD],
    );

    expect(await purgePrayerBatch(churchId, CUTOFF, 500)).toBe(1);
    expect(await countRows('prayer_request', churchId)).toBe(0);
  });
});
