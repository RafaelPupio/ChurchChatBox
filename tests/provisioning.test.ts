import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/** Lets a test wedge itself into provisionChurch AFTER the church row is
 *  committed but BEFORE the admin insert — the only window in which the
 *  compensating delete matters. hashPassword is the natural seam: it is the first
 *  thing the admin step awaits. */
const h = vi.hoisted(() => ({ beforeAdminInsert: null as null | (() => Promise<void>) }));

// Swap the neon-http client for an in-process Postgres. The factory is async and
// lazily evaluated, so it may build the client here; the raw handle is stashed on
// globalThis purely so the migrations can be applied below.
vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__pgliteClient = client;
  return { db: drizzle(client, { schema }) };
});

vi.mock('@/lib/auth/password', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/password')>();
  return {
    ...actual,
    hashPassword: async (password: string) => {
      if (h.beforeAdminInsert) await h.beforeAdminInsert();
      return actual.hashPassword(password);
    },
  };
});

const { provisionChurch } = await import('@/lib/provisioning');
const { PRIVACY_ITEM } = await import('@/lib/church-defaults');
const { db } = await import('@/db/client');
const { church, adminUser, menuItem } = await import('@/db/schema');
const { eq } = await import('drizzle-orm');

let client: PGlite;

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__pgliteClient as PGlite;
  const dir = join(process.cwd(), 'drizzle');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
});

describe('provisionChurch', () => {
  it('creates two fully independent churches', async () => {
    const a = await provisionChurch('Igreja A', 'a@exemplo.org', 'senha-forte-1');
    const b = await provisionChurch('Igreja B', 'b@exemplo.org', 'senha-forte-2');

    expect(a.churchId).not.toBe(b.churchId);

    const churches = await db.select().from(church);
    expect(churches).toHaveLength(2);
    expect(churches.every((c) => c.status === 'active')).toBe(true);

    for (const { churchId, adminUserId } of [a, b]) {
      const admins = await db.select().from(adminUser).where(eq(adminUser.churchId, churchId));
      expect(admins).toHaveLength(1);
      expect(admins[0].id).toBe(adminUserId);

      const items = await db.select().from(menuItem).where(eq(menuItem.churchId, churchId));
      expect(items).toHaveLength(1);
      expect(items[0].label).toContain('Privacidade');
      expect(items[0].bodyText).toContain('LGPD');
    }
  });

  it('refuses a duplicate admin email and leaves no orphan church behind', async () => {
    const before = (await db.select().from(church)).length;
    await expect(provisionChurch('Igreja C', 'a@exemplo.org', 'senha-forte-3')).rejects.toThrow(/already exists/);
    const after = (await db.select().from(church)).length;
    expect(after).toBe(before);
  });

  it('rolls the church back when the ADMIN insert fails', async () => {
    // The race findAdminByEmail cannot close: the address is free when checked and
    // taken by the time the insert runs. Without the compensating delete this
    // leaves a church nobody can log into, invisible in every UI, one more on
    // every retry.
    const [host] = await db.select().from(church).limit(1);
    h.beforeAdminInsert = async () => {
      await client.query(
        `insert into admin_user (church_id,email,password_hash) values ($1,'corrida@exemplo.org','h')`,
        [host.id],
      );
    };

    const before = (await db.select().from(church)).length;
    await expect(provisionChurch('Igreja Corrida', 'corrida@exemplo.org', 'senha-forte-4')).rejects.toThrow();
    h.beforeAdminInsert = null;

    expect(await db.select().from(church)).toHaveLength(before);
    expect(await db.select().from(church).where(eq(church.name, 'Igreja Corrida'))).toHaveLength(0);
  });

  it('keeps the church and admin when only the MENU insert fails, and reports menuSeeded: false', async () => {
    // A menu item is repairable in one click from the owner console. The church
    // and its admin are not: admin_user.email is globally unique, so rolling them
    // back over a cosmetic failure would wedge that address behind
    // findAdminByEmail forever, with no delete-church action to clear it.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    // NOT VALID so the constraint applies only to new rows — the churches created
    // by the tests above already hold a legitimate Privacidade item.
    const result = await (async () => {
      await client.exec(
        `alter table menu_item add constraint tmp_block_privacy_seed
           check (label <> '${PRIVACY_ITEM.label}') not valid`,
      );
      try {
        return await provisionChurch('Igreja Sem Menu', 'sem-menu@exemplo.org', 'senha-forte-5');
      } finally {
        await client.exec('alter table menu_item drop constraint tmp_block_privacy_seed');
      }
    })();
    // Snapshot before restoring: mockRestore() also clears mock.calls.
    const logged = errors.mock.calls.map((c) => String(c[0]));
    errors.mockRestore();

    expect(result.menuSeeded).toBe(false);

    const churches = await db.select().from(church).where(eq(church.id, result.churchId));
    expect(churches).toHaveLength(1);

    const admins = await db.select().from(adminUser).where(eq(adminUser.id, result.adminUserId));
    expect(admins).toHaveLength(1);
    expect(admins[0].email).toBe('sem-menu@exemplo.org');

    expect(await db.select().from(menuItem).where(eq(menuItem.churchId, result.churchId))).toHaveLength(0);

    // The failure must be traceable to a specific church, since the LGPD
    // transparency gap it leaves has to be repaired by hand or from the console.
    expect(logged.some((line) => line.includes(result.churchId))).toBe(true);
  });

  it('reports menuSeeded: true on the happy path', async () => {
    const r = await provisionChurch('Igreja Completa', 'completa@exemplo.org', 'senha-forte-6');
    expect(r.menuSeeded).toBe(true);
    expect(await db.select().from(menuItem).where(eq(menuItem.churchId, r.churchId))).toHaveLength(1);
  });
});
