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
    // This proves the double-click guard's BEHAVIOUR — one subject_request receipt per
    // contact — but it does NOT prove the guard is a partial index. subject_contact_id is
    // always non-NULL on subject_request rows, so a TOTAL unique index on
    // (church_id, subject_contact_id) — i.e. this same index with
    // `WHERE reason = 'subject_request'` silently dropped — would reject this duplicate
    // exactly the same way. The retention test below doesn't catch a dropped predicate
    // either, for the opposite reason: subject_contact_id is NULL there, and Postgres
    // never treats two NULLs as equal in a unique index, partial or not. So this pair of
    // tests cannot tell a partial index from a total one. What actually discriminates them:
    // the pg_indexes.indexdef assertion and the shared-non-NULL-subject_contact_id
    // retention test further down in this file.
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

  it('two retention rows may share a subject_contact_id — only a PARTIAL index allows it', async () => {
    // The test above (many retention rows) can't discriminate a partial index from a total
    // one: every row there has subject_contact_id NULL, and Postgres unique indexes never
    // treat two NULLs as equal regardless of any predicate. This test closes that gap by
    // giving two retention rows the SAME non-NULL subject_contact_id. reason='retention'
    // sits outside `WHERE reason = 'subject_request'`, so a genuinely partial index never
    // inspects these rows and both inserts succeed. If that WHERE clause is ever dropped —
    // hand-edit, drizzle-kit regression, merge conflict — the index becomes total and the
    // second insert here starts failing.
    const c = await client.query<{ id: string }>(
      `insert into contact (church_id,phone) values ($1,'5511900000001') returning id`,
      [churchId],
    );
    const sharedContactId = c.rows[0].id;

    await client.query(
      `insert into erasure_record (church_id,reason,status,subject_contact_id)
       values ($1,'retention','done',$2)`,
      [churchId, sharedContactId],
    );
    await client.query(
      `insert into erasure_record (church_id,reason,status,subject_contact_id)
       values ($1,'retention','done',$2)`,
      [churchId, sharedContactId],
    );

    const rows = await client.query<{ n: string }>(
      `select count(*) as n from erasure_record where church_id = $1 and subject_contact_id = $2`,
      [churchId, sharedContactId],
    );
    expect(Number(rows.rows[0].n)).toBe(2);
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

  it('the subject_uq index carries the partial WHERE predicate, not just the columns', async () => {
    // Same hand-check as the idle index above, for the other expression the behavioural
    // tests can't pin on their own: the double-click guard depends on
    // `WHERE reason = 'subject_request'` narrowing erasure_record_subject_uq to a partial
    // index. Reading the columns back from pg_indexes would pass whether or not that clause
    // survived drizzle-kit or a hand-edit; reading indexdef catches its absence directly.
    const idx = await client.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'erasure_record_subject_uq'`,
    );
    expect(idx.rows).toHaveLength(1);
    const def = idx.rows[0].indexdef.toLowerCase();
    expect(def).toContain('where');
    expect(def).toContain('subject_request');
  });
});
