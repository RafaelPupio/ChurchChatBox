import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * tenant-isolation.test.ts proves the SCHEMA enforces tenant isolation — that a
 * hand-written two-predicate WHERE clause behaves correctly against a real
 * Postgres engine. It does not, and cannot, prove that any actual repository
 * function in src/lib/repo/*.ts includes that predicate: it never calls them.
 *
 * This suite closes that gap. It substitutes the drizzle client that the real
 * repository functions import, then calls those functions directly (unmodified,
 * same signatures as used in application code) against two churches in an
 * in-memory Postgres (PGlite). If a repo function ever dropped its church_id
 * predicate, this is the suite that would catch it.
 *
 * Does not cover src/lib/repo/platform.ts (the owner-only cross-church repo) —
 * that module does not exist yet.
 */

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__repoIsolationClient = client;
  return { db: drizzle(client, { schema }) };
});

import { listConversations, loadConversation } from '@/lib/repo/inbox';
import { listMenuItemsForAdmin, updateMenuItem } from '@/lib/repo/menu-admin';
import { listPrayerRequests, updatePrayerStatus } from '@/lib/repo/prayer-admin';
import { deleteAdmin, listAdmins } from '@/lib/repo/admin';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

interface Fixture {
  churchId: string;
  contactId: string;
  menuItemId: string;
  prayerId: string;
  adminId: string;
}

let client: PGlite;
let A: Fixture;
let B: Fixture;

async function makeChurch(name: string, phone: string, phoneNumberId: string): Promise<Fixture> {
  const c = await client.query<{ id: string }>(
    `insert into church (name,phone_number_id,access_token,app_secret,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,$2,'tok','sec','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [name, phoneNumberId],
  );
  const churchId = c.rows[0].id;
  const ct = await client.query<{ id: string }>(
    `insert into contact (church_id,phone,name,mode,last_inbound_at) values ($1,$2,$3,'human',now()) returning id`,
    [churchId, phone, `Membro de ${name}`],
  );
  const contactId = ct.rows[0].id;
  await client.query(
    `insert into message (church_id,contact_id,wa_message_id,direction,body) values ($1,$2,$3,'inbound',$4)`,
    [churchId, contactId, `wamid.repo.${name}`, `segredo de ${name}`],
  );
  const mi = await client.query<{ id: string }>(
    `insert into menu_item (church_id,position,label,body_text,is_active,kind) values ($1,1,$2,'corpo',true,'content') returning id`,
    [churchId, `Menu ${name}`],
  );
  const pr = await client.query<{ id: string }>(
    `insert into prayer_request (church_id,contact_id,text) values ($1,$2,$3) returning id`,
    [churchId, contactId, `oração privada de ${name}`],
  );
  const ad = await client.query<{ id: string }>(
    `insert into admin_user (church_id,email,password_hash,name) values ($1,$2,'h',$3) returning id`,
    [churchId, `repo-admin@${name}.org`, `Admin ${name}`],
  );
  return { churchId, contactId, menuItemId: mi.rows[0].id, prayerId: pr.rows[0].id, adminId: ad.rows[0].id };
}

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__repoIsolationClient as PGlite;

  // Apply every migration in order, exactly as tenant-isolation.test.ts does, so
  // this suite keeps working as migrations accrue.
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }

  A = await makeChurch('RepoIgrejaA', '5533333', 'PNID_REPO_A');
  B = await makeChurch('RepoIgrejaB', '5544444', 'PNID_REPO_B');
});

describe('repository-layer tenant isolation', () => {
  it('listConversations returns only the caller church\'s contacts', async () => {
    const rows = await listConversations(A.churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(A.contactId);
  });

  it('loadConversation with another church\'s contactId returns null', async () => {
    const result = await loadConversation(A.churchId, B.contactId);
    expect(result).toBeNull();
  });

  it('listMenuItemsForAdmin excludes another church\'s items', async () => {
    const rows = await listMenuItemsForAdmin(A.churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(A.menuItemId);
  });

  it('listPrayerRequests excludes another church\'s prayers', async () => {
    const rows = await listPrayerRequests(A.churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(A.prayerId);
  });

  it('updateMenuItem cannot edit another church\'s item', async () => {
    await updateMenuItem(B.menuItemId, A.churchId, { label: 'HACKED' });

    const rows = await listMenuItemsForAdmin(B.churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Menu RepoIgrejaB');
    expect(rows[0].label).not.toBe('HACKED');
  });

  it('updatePrayerStatus cannot mark another church\'s prayer request', async () => {
    await updatePrayerStatus(B.prayerId, A.churchId, 'orado');

    const rows = await listPrayerRequests(B.churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('novo');
  });

  it('deleteAdmin cannot delete another church\'s admin', async () => {
    await deleteAdmin(B.adminId, A.churchId);

    const rows = await listAdmins(B.churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(B.adminId);
  });
});
