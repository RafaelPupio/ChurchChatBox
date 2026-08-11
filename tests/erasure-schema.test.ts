import { beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/** The migration is the only place these guards exist. A dropped partial-index
 *  predicate, a missing column or a mistyped enum all produce code that
 *  typechecks and a database that does not enforce what the design relies on. */

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
let client: PGlite;
let churchId: string;
let contactId: string;

beforeAll(async () => {
  client = new PGlite();
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
       unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ('Igreja Esquema','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
  );
  churchId = c.rows[0].id;
  const ct = await client.query<{ id: string }>(
    `insert into contact (church_id,phone) values ($1,'5511900000000') returning id`,
    [churchId],
  );
  contactId = ct.rows[0].id;
});

describe('erasure_record schema', () => {
  it('accepts one subject_request receipt per contact', async () => {
    const r = await client.query<{ id: string }>(
      `insert into erasure_record (church_id,reason,status,subject_contact_id,messages_deleted,prayers_deleted,contacts_deleted)
       values ($1,'subject_request','pending',$2,5,2,1) returning id`,
      [churchId, contactId],
    );
    expect(r.rows).toHaveLength(1);
  });

  it('REJECTS a second subject_request receipt for the same contact', async () => {
    // This is the double-click guard, at the schema level. If drizzle-kit dropped
    // the partial predicate this insert succeeds and the test fails here.
    await expect(
      client.query(
        `insert into erasure_record (church_id,reason,status,subject_contact_id)
         values ($1,'subject_request','pending',$2)`,
        [churchId, contactId],
      ),
    ).rejects.toThrow(/erasure_record_subject_uq|unique/i);
  });

  it('allows MANY retention rows for one church — the partial predicate excludes them', async () => {
    for (let i = 0; i < 3; i += 1) {
      await client.query(
        `insert into erasure_record (church_id,reason,status) values ($1,'retention','done')`,
        [churchId],
      );
    }
    const rows = await client.query<{ n: string }>(
      `select count(*) as n from erasure_record where church_id = $1 and reason = 'retention'`,
      [churchId],
    );
    expect(Number(rows.rows[0].n)).toBe(3);
  });

  it('cascades receipts away with the church, and survives the contact', async () => {
    // The contact FK is deliberately absent: deleting the subject must NOT destroy
    // the proof that the subject was deleted.
    await client.query(`delete from contact where id = $1`, [contactId]);
    const kept = await client.query<{ n: string }>(
      `select count(*) as n from erasure_record where subject_contact_id = $1`,
      [contactId],
    );
    expect(Number(kept.rows[0].n)).toBe(1);

    await client.query(`delete from church where id = $1`, [churchId]);
    const gone = await client.query<{ n: string }>(
      `select count(*) as n from erasure_record where church_id = $1`,
      [churchId],
    );
    expect(Number(gone.rows[0].n)).toBe(0);
  });

  it('church carries the retention cursor, defaulting to NULL', async () => {
    const c = await client.query<{ retention_purged_at: Date | null }>(
      `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
         unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
       values ('Igreja Cursor','oi','menu','Ver opções','x','y','z','p','q','r','s')
       returning retention_purged_at`,
    );
    expect(c.rows[0].retention_purged_at).toBeNull();
  });
});

describe('the indexes the purge and export predicates need', () => {
  it('creates all five, and the idle one is over the coalesce EXPRESSION', async () => {
    const idx = await client.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where indexname in ('message_church_created_idx','message_contact_keyset_idx',
                            'prayer_request_church_created_idx','prayer_request_contact_keyset_idx',
                            'contact_church_idle_idx')`,
    );
    expect(idx.rows.map((r) => r.indexname).sort()).toEqual([
      'contact_church_idle_idx',
      'message_church_created_idx',
      'message_contact_keyset_idx',
      'prayer_request_church_created_idx',
      'prayer_request_contact_keyset_idx',
    ]);

    // A plain ("church_id","last_inbound_at") index cannot serve
    // coalesce(last_inbound_at, created_at) < $cutoff. Nothing else in the suite
    // would notice the difference, which is why this assertion is here.
    const idle = idx.rows.find((r) => r.indexname === 'contact_church_idle_idx')!;
    expect(idle.indexdef.toLowerCase()).toContain('coalesce');
  });
});
