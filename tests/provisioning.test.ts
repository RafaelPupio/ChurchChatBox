import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const { provisionChurch } = await import('@/lib/provisioning');
const { db } = await import('@/db/client');
const { church, adminUser, menuItem } = await import('@/db/schema');
const { eq } = await import('drizzle-orm');

beforeAll(async () => {
  const client = (globalThis as Record<string, unknown>).__pgliteClient as {
    exec: (sql: string) => Promise<unknown>;
  };
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
});
