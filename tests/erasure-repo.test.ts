import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__erasureRepoClient = client;
  return { db: drizzle(client, { schema }) };
});

import {
  completeErasureRecord,
  findErasureByContact,
  findErasureByPhoneHash,
  listErasureRecords,
  openSubjectErasure,
  receiptCreatedAt,
} from '@/lib/repo/erasure';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
let client: PGlite;
let churchId: string;
let otherChurchId: string;
let contactId: string;

async function makeChurch(name: string): Promise<string> {
  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
       unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,'oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [name],
  );
  return c.rows[0].id;
}

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__erasureRepoClient as PGlite;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
  churchId = await makeChurch('Igreja Comprovante');
  otherChurchId = await makeChurch('Igreja Vizinha');
  const ct = await client.query<{ id: string }>(
    `insert into contact (church_id,phone,name) values ($1,'5511999998888','Maria') returning id`,
    [churchId],
  );
  contactId = ct.rows[0].id;
});

describe('openSubjectErasure', () => {
  it('mints a pending receipt carrying the PRE-DELETE counts', async () => {
    const rec = await openSubjectErasure({
      churchId, contactId, phoneHash: 'abc123', performedByEmail: 'secretaria@igreja.org',
      messages: 412, prayers: 3,
    });
    expect(rec).not.toBeNull();
    expect(rec!.id).toMatch(/^[0-9a-f-]{36}$/);

    const row = await findErasureByContact(churchId, contactId);
    expect(row!.status).toBe('pending');
    expect(row!.messagesDeleted).toBe(412);
    expect(row!.prayersDeleted).toBe(3);
    expect(row!.contactsDeleted).toBe(1);
    expect(row!.performedByEmail).toBe('secretaria@igreja.org');
  });

  it('returns null on a SECOND attempt for the same contact — the double-click', async () => {
    // Zero rows inserted is a meaningful answer, not a failure. The guard is the
    // partial unique index inside the statement, not an application pre-check
    // (which would be TOCTOU).
    const again = await openSubjectErasure({
      churchId, contactId, phoneHash: 'abc123', performedByEmail: 'outra@igreja.org',
      messages: 999, prayers: 999,
    });
    expect(again).toBeNull();

    const all = await listErasureRecords(churchId, 50);
    expect(all.filter((r) => r.subjectContactId === contactId)).toHaveLength(1);
    // And the loser did not overwrite the winner's numbers.
    expect(all.find((r) => r.subjectContactId === contactId)!.messagesDeleted).toBe(412);
  });

  it('returns null for a contact that does not exist — no phantom receipt', async () => {
    const rec = await openSubjectErasure({
      churchId, contactId: '00000000-0000-0000-0000-000000000000',
      phoneHash: null, performedByEmail: 'x@y.org', messages: 0, prayers: 0,
    });
    expect(rec).toBeNull();
  });

  it('returns null for another church\'s contact', async () => {
    // The INSERT … SELECT FROM contact WHERE id AND church_id is what makes this
    // impossible, rather than a check the caller has to remember.
    const rec = await openSubjectErasure({
      churchId: otherChurchId, contactId,
      phoneHash: null, performedByEmail: 'invasor@vizinha.org', messages: 0, prayers: 0,
    });
    expect(rec).toBeNull();
    expect(await findErasureByContact(otherChurchId, contactId)).toBeNull();
  });

  it('stores a null hash when the secret was absent, and still records', async () => {
    const ct = await client.query<{ id: string }>(
      `insert into contact (church_id,phone) values ($1,'5511777776666') returning id`, [churchId],
    );
    const rec = await openSubjectErasure({
      churchId, contactId: ct.rows[0].id, phoneHash: null,
      performedByEmail: 'secretaria@igreja.org', messages: 1, prayers: 0,
    });
    expect(rec).not.toBeNull();
    expect((await findErasureByContact(churchId, ct.rows[0].id))!.subjectPhoneHash).toBeNull();
  });
});

describe('completeErasureRecord', () => {
  it('flips status to done and stamps completed_at WITHOUT touching counts', async () => {
    // The counts were written at open time from a pre-delete observation. If
    // completion could write them, the sweep would have to invent numbers for a
    // contact row that no longer exists.
    const before = await findErasureByContact(churchId, contactId);
    await completeErasureRecord(before!.id, churchId);

    const after = await findErasureByContact(churchId, contactId);
    expect(after!.status).toBe('done');
    expect(after!.completedAt).not.toBeNull();
    expect(after!.messagesDeleted).toBe(412);
    expect(after!.prayersDeleted).toBe(3);
  });

  it('cannot complete another church\'s record', async () => {
    const rec = await findErasureByContact(churchId, contactId);
    await completeErasureRecord(rec!.id, otherChurchId);
    // Still whatever it already was; the wrong church changed nothing.
    expect((await findErasureByContact(churchId, contactId))!.status).toBe('done');
  });
});

describe('findErasureByPhoneHash', () => {
  it('finds the receipt for a hash within the church', async () => {
    const found = await findErasureByPhoneHash(churchId, 'abc123');
    expect(found).not.toBeNull();
    expect(found!.status).toBe('done');
  });

  it('does not find another church\'s receipt', async () => {
    expect(await findErasureByPhoneHash(otherChurchId, 'abc123')).toBeNull();
  });

  it('returns null for an unknown hash', async () => {
    expect(await findErasureByPhoneHash(churchId, 'nao-existe')).toBeNull();
  });
});

describe('listErasureRecords', () => {
  it('returns this church\'s records newest first', async () => {
    const rows = await listErasureRecords(churchId, 50);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(rows[i].createdAt.getTime());
    }
  });

  it('never returns another church\'s records', async () => {
    expect(await listErasureRecords(otherChurchId, 50)).toEqual([]);
  });
});

describe('receiptCreatedAt — the driver shapes only PGlite can be trusted about', () => {
  // openSubjectErasure reads created_at off a RAW statement, so drizzle applies no
  // timestamp mapper and the value is whatever the driver chose. PGlite is the only
  // driver this suite can exercise, and it is the one that returns a real Date —
  // which is precisely why the string case has to be tested by hand.
  const OBSERVED = new Date('2026-08-11T07:00:00.000Z');

  it('passes a real Date through, which is what PGlite returns', () => {
    const d = new Date('2026-08-11T06:00:00.803Z');
    expect(receiptCreatedAt(d, OBSERVED).toISOString()).toBe('2026-08-11T06:00:00.803Z');
  });

  it('parses Postgres timestamp text, which is what an unmapped neon-http value is', () => {
    expect(receiptCreatedAt('2026-08-11 06:00:00.803+00', OBSERVED).toISOString())
      .toBe('2026-08-11T06:00:00.803Z');
  });

  it('never yields an Invalid Date, and says so operator-side when it has to guess', () => {
    // The receipt renders this: `Comprovante registrado em {fmt(recordedAt)}`, and
    // toLocaleDateString on an Invalid Date returns the literal string
    // "Invalid Date". The most consequential confirmation in the product would
    // read "Comprovante registrado em Invalid Date."
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const bad of [null, undefined, 'lixo', {}, new Date('nada')]) {
      const got = receiptCreatedAt(bad, OBSERVED);
      expect(Number.isNaN(got.getTime())).toBe(false);
      expect(got.toISOString()).toBe(OBSERVED.toISOString());
    }
    expect(spy).toHaveBeenCalledTimes(5);
    spy.mockRestore();
  });
});
