import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/** The Caixa badge is the panel's only "someone is waiting" signal, and the
 *  conversation ordering is what a secretary sees first on a 3-inch screen. Both
 *  are single SQL expressions, so both are worth pinning against a real Postgres
 *  engine rather than trusting by inspection. */

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__inboxBadgeClient = client;
  return { db: drizzle(client, { schema }) };
});

import { countHandoffContacts, listConversations } from '@/lib/repo/inbox';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

let client: PGlite;
let churchA = '';
let churchB = '';

async function makeChurch(name: string, phoneNumberId: string): Promise<string> {
  const c = await client.query<{ id: string }>(
    `insert into church (name,phone_number_id,access_token,app_secret,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,$2,'tok','sec','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [name, phoneNumberId],
  );
  return c.rows[0].id;
}

async function addContact(churchId: string, phone: string, mode: string, minutesAgo: number | null): Promise<void> {
  await client.query(
    `insert into contact (church_id,phone,name,mode,last_inbound_at)
     values ($1,$2,$3,$4, case when $5::int is null then null else now() - ($5::int * interval '1 minute') end)`,
    [churchId, phone, `Membro ${phone}`, mode, minutesAgo],
  );
}

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__inboxBadgeClient as PGlite;

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }

  churchA = await makeChurch('BadgeIgrejaA', 'PNID_BADGE_A');
  churchB = await makeChurch('BadgeIgrejaB', 'PNID_BADGE_B');

  await addContact(churchA, '5511000001', 'bot', 1);            // newest, but no one waiting
  await addContact(churchA, '5511000002', 'human', 90);         // waiting, older
  await addContact(churchA, '5511000003', 'human', 30);         // waiting, newer
  await addContact(churchA, '5511000004', 'awaiting_prayer', null);
  await addContact(churchB, '5522000001', 'human', 5);          // another church's handoff
});

describe('countHandoffContacts', () => {
  it('counts only conversations in human mode', async () => {
    expect(await countHandoffContacts(churchA)).toBe(2);
  });

  it('never counts another church\'s handoffs', async () => {
    expect(await countHandoffContacts(churchB)).toBe(1);
  });

  it('returns 0, not undefined, for a church with nobody waiting', async () => {
    const empty = await makeChurch('BadgeIgrejaVazia', 'PNID_BADGE_EMPTY');
    expect(await countHandoffContacts(empty)).toBe(0);
  });
});

describe('listConversations ordering', () => {
  it('puts everyone waiting on a human above everyone else', async () => {
    const rows = await listConversations(churchA);
    expect(rows.map((r) => r.phone)).toEqual([
      '5511000003', // human, 30 min ago
      '5511000002', // human, 90 min ago
      '5511000001', // bot, 1 min ago — recent, but nobody is waiting
      '5511000004', // never messaged: NULL last, not first
    ]);
  });

  it('still excludes other churches', async () => {
    const rows = await listConversations(churchB);
    expect(rows).toHaveLength(1);
  });
});
