import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__expiringClient = client;
  return { db: drizzle(client, { schema }) };
});

import { countExpiringPrayers, pageExpiringPrayers } from '@/lib/repo/prayer-admin';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
// retentionCutoff(now) + 30 days — the set the next 30 days of purges destroys.
const BEFORE = new Date('2025-09-10T06:00:00.000Z');
let client: PGlite;
let churchA: string;
let churchB: string;

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__expiringClient as PGlite;
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
  const mk = async (name: string) => {
    const c = await client.query<{ id: string }>(
      `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
         unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
       values ($1,'oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`, [name],
    );
    return c.rows[0].id;
  };
  churchA = await mk('Igreja A');
  churchB = await mk('Igreja B');

  for (const [churchId, phone] of [[churchA, '5511111111111'], [churchB, '5522222222222']] as const) {
    const ct = await client.query<{ id: string }>(
      `insert into contact (church_id,phone,name) values ($1,$2,'Dona Cida') returning id`,
      [churchId, phone],
    );
    await client.query(
      `insert into prayer_request (church_id,contact_id,text,created_at) values
        ($1,$2,'onze meses','2025-09-01T00:00:00Z'),
        ($1,$2,'onze e meio','2025-08-20T00:00:00Z'),
        ($1,$2,'seis meses','2026-02-01T00:00:00Z')`,
      [churchId, ct.rows[0].id],
    );
  }
});

describe('countExpiringPrayers', () => {
  it('counts only prayers inside the 30-day window', async () => {
    expect(await countExpiringPrayers(churchA, BEFORE)).toBe(2);
  });

  it('is church-scoped', async () => {
    // Each church has its own two; neither sees four.
    expect(await countExpiringPrayers(churchB, BEFORE)).toBe(2);
  });

  it('returns 0 for a church with none — the warning then renders nothing at all', async () => {
    const c = await client.query<{ id: string }>(
      `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
         unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
       values ('Igreja Vazia','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    );
    expect(await countExpiringPrayers(c.rows[0].id, BEFORE)).toBe(0);
  });
});

describe('pageExpiringPrayers', () => {
  it('carries nome e whatsapp — an unattributed prayer is pastorally worthless', async () => {
    // This makes the file the single most sensitive artifact the subsystem
    // produces, which is why the panel copy says so in as many words.
    const rows = await pageExpiringPrayers(churchA, BEFORE, null, 100);
    expect(rows).toHaveLength(2);
    expect(rows[0].contactName).toBe('Dona Cida');
    expect(rows[0].contactPhone).toBe('5511111111111');
  });

  it('never returns another church\'s prayers', async () => {
    const rows = await pageExpiringPrayers(churchA, BEFORE, null, 100);
    expect(rows.every((r) => r.contactPhone === '5511111111111')).toBe(true);
  });

  it('pages by keyset ascending', async () => {
    const first = await pageExpiringPrayers(churchA, BEFORE, null, 1);
    expect(first).toHaveLength(1);
    const second = await pageExpiringPrayers(
      churchA, BEFORE, { createdAt: first[0].createdAt, id: first[0].id }, 10,
    );
    expect(second).toHaveLength(1);
    expect(second[0].id).not.toBe(first[0].id);
  });
});
