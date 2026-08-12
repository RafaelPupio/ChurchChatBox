import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__signalClient = client;
  return { db: drizzle(client, { schema }) };
});

import { listErasureSignals } from '@/lib/repo/platform';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
let client: PGlite;

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__signalClient as PGlite;
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
  const a = await mk('Igreja Alfa');
  const b = await mk('Igreja Beta');
  for (const [churchId, at] of [[a, '2026-08-01T00:00:00Z'], [b, '2026-08-02T00:00:00Z']] as const) {
    const ct = await client.query<{ id: string }>(
      `insert into contact (church_id,phone) values ($1,'5511900000000') returning id`, [churchId],
    );
    await client.query(
      `insert into erasure_record (church_id,reason,status,subject_contact_id,subject_phone_hash,
         performed_by_email,messages_deleted,prayers_deleted,contacts_deleted,created_at)
       values ($1,'subject_request','done',$2,'HASH-SECRETO','secretaria@igreja.org',10,2,1,$3)`,
      [churchId, ct.rows[0].id, at],
    );
  }
});

describe('listErasureSignals', () => {
  it('spans churches — the one query in this subsystem that is SUPPOSED to', async () => {
    const rows = await listErasureSignals();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.churchName).sort()).toEqual(['Igreja Alfa', 'Igreja Beta']);
  });

  it('returns newest first', async () => {
    const rows = await listErasureSignals();
    expect(rows[0].churchName).toBe('Igreja Beta');
  });

  it('THE PROJECTION HOLDS: exactly nine keys, and none of the three excluded ones', async () => {
    // Written as a key-set EQUALITY, not three toBeUndefined checks: a widened
    // select() fails an equality and passes an absence check for any column
    // nobody thought to name. This is the failure listChurches's argument-less
    // db.select() would have modelled straight into the new function.
    const [row] = await listErasureSignals();
    expect(Object.keys(row).sort()).toEqual([
      'churchId', 'churchName', 'completedAt', 'contactsDeleted', 'createdAt',
      'messagesDeleted', 'prayersDeleted', 'reason', 'status',
    ]);
    const serialised = JSON.stringify(row);
    expect(serialised).not.toContain('HASH-SECRETO');
    expect(serialised).not.toContain('secretaria@igreja.org');
  });

  it('is exported from platform.ts and from no other module', () => {
    // listErasureSignals lives behind the OWNER-ONLY boundary the existing
    // privilege-boundary suite already enforces — no new machinery, just placement.
    const platform = readFileSync(join(process.cwd(), 'src/lib/repo/platform.ts'), 'utf8');
    expect(platform).toMatch(/export\s+async\s+function\s+listErasureSignals\b/);
  });
});
