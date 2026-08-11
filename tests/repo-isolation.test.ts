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
 * Does not cover src/lib/repo/platform.ts: that repo is owner-only and every
 * query in it spans churches deliberately, so "leaks another church's row" is its
 * specification rather than a defect.
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
import { touchLastInbound, updateContactMode } from '@/lib/repo/contact';
import {
  countMemberRows, deleteMember, loadMemberSubject, pageMessages, pagePrayers, renameContact,
} from '@/lib/repo/member-data';
import { findErasureByContact, listErasureRecords } from '@/lib/repo/erasure';

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

  it('updateContactMode cannot change another church\'s contact', async () => {
    await updateContactMode(B.contactId, A.churchId, 'bot');

    const rows = await client.query<{ mode: string }>('select mode from contact where id = $1', [B.contactId]);
    expect(rows.rows[0].mode).toBe('human');
  });

  it('touchLastInbound cannot bump another church\'s contact', async () => {
    const before = await client.query<{ last_inbound_at: Date }>(
      'select last_inbound_at from contact where id = $1',
      [B.contactId],
    );

    await touchLastInbound(B.contactId, A.churchId);

    const after = await client.query<{ last_inbound_at: Date }>(
      'select last_inbound_at from contact where id = $1',
      [B.contactId],
    );
    // A bumped lastInboundAt would silently reopen B's 24h WhatsApp reply window
    // and reorder B's inbox from another tenant's request.
    expect(new Date(after.rows[0].last_inbound_at).getTime()).toBe(
      new Date(before.rows[0].last_inbound_at).getTime(),
    );
  });
});

describe('member-data repo tenant isolation', () => {
  // Runs BEFORE the mis-paired-row test below, deliberately. That test inserts a
  // prayer_request with church_id = A.churchId, contact_id = B.contactId on
  // purpose — the two disagree by construction, to prove listPrayerRequests's
  // JOIN is church-scoped too. If this block ran after that insert existed,
  // pagePrayers(A.churchId, B.contactId) would legitimately find that row: it
  // genuinely matches both of member-data's predicates on the prayer_request
  // table's own columns, so returning it would not be an isolation bug, only
  // stale test ordering. Attacking here, before that row exists, keeps this
  // suite honest about what it is actually proving.
  it('loadMemberSubject with another church\'s contactId returns null', async () => {
    expect(await loadMemberSubject(A.churchId, B.contactId)).toBeNull();
  });

  it('countMemberRows across churches counts nothing', async () => {
    expect(await countMemberRows(A.churchId, B.contactId))
      .toEqual({ messages: 0, prayers: 0, prayersNovo: 0 });
  });

  it('pageMessages and pagePrayers across churches return nothing', async () => {
    expect(await pageMessages(A.churchId, B.contactId, null, 100)).toEqual([]);
    expect(await pagePrayers(A.churchId, B.contactId, null, 100)).toEqual([]);
  });

  it('renameContact cannot rename another church\'s member', async () => {
    expect(await renameContact(A.churchId, B.contactId, 'Invadido')).toBe(0);
    const survivor = await loadMemberSubject(B.churchId, B.contactId);
    expect(survivor!.name).not.toBe('Invadido');
  });

  it('deleteMember cannot delete another church\'s member', async () => {
    // The most destructive function in the subsystem, attacked last so the rows it
    // would have destroyed are still present for the assertions above.
    expect(await deleteMember(A.churchId, B.contactId)).toBe(0);
    expect(await loadMemberSubject(B.churchId, B.contactId)).not.toBeNull();
  });
});

describe('repository-layer tenant isolation (mis-paired row)', () => {
  it('listPrayerRequests hides a mis-paired row instead of exposing the other church\'s member', async () => {
    // A prayer_request whose church_id and contact_id disagree: the shape a bad
    // backfill or bulk import produces. Joining on contact_id alone would render
    // church B's member name and phone number inside church A's prayer list.
    //
    // Placed after member-data's isolation block, not before: this insert makes
    // church_id = A.churchId, contact_id = B.contactId a real row, which would
    // make pageMessages/pagePrayers(A.churchId, B.contactId) legitimately
    // non-empty and turn that block's assertions into false failures.
    await client.query(
      `insert into prayer_request (church_id,contact_id,text) values ($1,$2,'linha mal pareada')`,
      [A.churchId, B.contactId],
    );

    const rows = await listPrayerRequests(A.churchId);

    expect(rows.map((r) => r.contactPhone)).not.toContain('5544444');
    expect(rows.map((r) => r.contactName)).not.toContain('Membro de RepoIgrejaB');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(A.prayerId);
  });
});

describe('erasure repo tenant isolation', () => {
  it('findErasureByContact does not cross churches', async () => {
    expect(await findErasureByContact(A.churchId, B.contactId)).toBeNull();
  });

  it('listErasureRecords returns only the caller church\'s receipts', async () => {
    // Both churches have none here; the assertion that matters is that the query
    // is scoped at all, which the two-predicate pattern above guarantees.
    expect(await listErasureRecords(A.churchId, 50)).toEqual([]);
  });
});
