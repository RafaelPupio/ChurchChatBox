import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * The reset token's lifecycle — minted, spent once, expired, invalidated —
 * against a REAL Postgres running the REAL migrations, the same approach as
 * tests/repo-isolation.test.ts and tests/session-guards.test.ts.
 *
 * tests/reset-token.test.ts already covers the pure rules. This suite exists
 * because those rules are only worth anything if the SQL agrees with them, and
 * the SQL is where they can silently disagree: a dropped `used_at is null`
 * predicate makes a token reusable forever, and no type error and no pure test
 * would notice.
 *
 * What is NOT unit-testable here, said plainly rather than faked: the Server
 * Actions and pages in src/app/admin/esqueci-senha and .../redefinir-senha. They
 * need a request context (cookies, useActionState, redirect) that does not exist
 * outside Next's runtime, and this repo has no harness for one. Writing tests
 * that mock every one of their dependencies would assert only that the mocks were
 * called, so they are verified by `npm run build` and by hand.
 */

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__passwordResetClient = client;
  return { db: drizzle(client, { schema }) };
});

const {
  createResetToken,
  consumeResetToken,
  invalidateResetTokensFor,
  listResetTokensFor,
} = await import('@/lib/repo/password-reset');
const {
  RESET_REQUEST_MIN_INTERVAL_MS,
  generateResetToken,
  hashResetToken,
  resetTokenExpiresAt,
} = await import('@/lib/auth/reset-token');

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

let client: PGlite;
let churchCounter = 0;

async function makeAdmin(label: string): Promise<{ churchId: string; adminId: string }> {
  churchCounter += 1;
  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,'oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [`Igreja ${label} ${churchCounter}`],
  );
  const churchId = c.rows[0].id;
  const a = await client.query<{ id: string }>(
    `insert into admin_user (church_id,email,password_hash,name) values ($1,$2,'hash','Secretária') returning id`,
    [churchId, `reset-${label}-${churchCounter}@exemplo.org`],
  );
  return { churchId, adminId: a.rows[0].id };
}

/** Mints a token for an admin and hands back both halves, as the request action
 *  does: the plaintext goes in the link, the hash goes in the database. */
async function mint(adminId: string, now: Date) {
  const token = generateResetToken();
  const created = await createResetToken({
    adminUserId: adminId,
    tokenHash: hashResetToken(token),
    expiresAt: resetTokenExpiresAt(now),
    now,
  });
  return { token, created };
}

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__passwordResetClient as PGlite;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
});

describe('what the database actually stores', () => {
  it('never stores the token itself, in any column', async () => {
    // The whole point of hashing. A leaked backup must not contain a working link.
    const { adminId } = await makeAdmin('armazenamento');
    const { token } = await mint(adminId, new Date());

    const rows = await client.query<Record<string, unknown>>(
      'select * from password_reset_token where admin_user_id = $1',
      [adminId],
    );
    expect(rows.rows).toHaveLength(1);
    const serialised = JSON.stringify(rows.rows[0]);
    expect(serialised).not.toContain(token);
    expect(serialised).toContain(hashResetToken(token));
  });

  it('stores the hash the pure helper produces, so the two layers agree', async () => {
    const { adminId } = await makeAdmin('acordo');
    const { token } = await mint(adminId, new Date());

    const stored = await listResetTokensFor(adminId);
    expect(stored[0].tokenHash).toBe(hashResetToken(token));
    expect(stored[0].usedAt).toBeNull();
  });

  it('refuses two rows with the same hash', async () => {
    // The unique index is load-bearing: consumption is a single UPDATE matched on
    // token_hash, and a duplicate would make "which row did I just spend" ambiguous.
    const { adminId } = await makeAdmin('unico');
    const token = generateResetToken();
    const now = new Date();
    await createResetToken({
      adminUserId: adminId,
      tokenHash: hashResetToken(token),
      expiresAt: resetTokenExpiresAt(now),
      now,
    });

    await expect(
      client.query(
        `insert into password_reset_token (admin_user_id,token_hash,expires_at) values ($1,$2,$3)`,
        [adminId, hashResetToken(token), resetTokenExpiresAt(now)],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });
});

describe('consuming a token', () => {
  it('returns the admin the token belongs to', async () => {
    const { adminId } = await makeAdmin('consumo');
    const now = new Date();
    const { token } = await mint(adminId, now);

    expect(await consumeResetToken(hashResetToken(token), now)).toBe(adminId);
  });

  it('marks it used, so the row records that it was spent', async () => {
    const { adminId } = await makeAdmin('marcado');
    const now = new Date();
    const { token } = await mint(adminId, now);

    await consumeResetToken(hashResetToken(token), now);

    const stored = await listResetTokensFor(adminId);
    expect(stored[0].usedAt).not.toBeNull();
  });

  it('is SINGLE USE — a second attempt gets nothing', async () => {
    const { adminId } = await makeAdmin('unicouso');
    const now = new Date();
    const { token } = await mint(adminId, now);

    expect(await consumeResetToken(hashResetToken(token), now)).toBe(adminId);
    expect(await consumeResetToken(hashResetToken(token), now)).toBeNull();
    expect(await consumeResetToken(hashResetToken(token), now)).toBeNull();
  });

  it('gives exactly one winner when the same link is submitted twice at once', async () => {
    // Honest about what this proves: PGlite runs one connection, so these two
    // calls serialise and this cannot exercise Postgres row locking. What it does
    // pin is the predicate — `used_at is null` inside the same statement that
    // writes used_at. Drop that predicate and BOTH callers get the admin id back,
    // which is the shape the real concurrent bug takes.
    const { adminId } = await makeAdmin('corrida');
    const now = new Date();
    const { token } = await mint(adminId, now);

    const results = await Promise.all([
      consumeResetToken(hashResetToken(token), now),
      consumeResetToken(hashResetToken(token), now),
    ]);

    expect(results.filter((r) => r === adminId)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(1);
  });

  it('refuses an expired token', async () => {
    const { adminId } = await makeAdmin('expirado');
    const mintedAt = new Date('2026-08-08T12:00:00.000Z');
    const { token } = await mint(adminId, mintedAt);

    const anHourAndABitLater = new Date(mintedAt.getTime() + 61 * 60 * 1000);
    expect(await consumeResetToken(hashResetToken(token), anHourAndABitLater)).toBeNull();
  });

  it('accepts a token one millisecond before it expires and refuses it at the instant', async () => {
    // The SQL predicate and the pure isResetTokenUsable must agree on the boundary.
    const mintedAt = new Date('2026-08-08T12:00:00.000Z');
    const expiresAt = resetTokenExpiresAt(mintedAt);

    const early = await makeAdmin('limite-antes');
    const earlyToken = await mint(early.adminId, mintedAt);
    expect(
      await consumeResetToken(hashResetToken(earlyToken.token), new Date(expiresAt.getTime() - 1)),
    ).toBe(early.adminId);

    const exact = await makeAdmin('limite-exato');
    const exactToken = await mint(exact.adminId, mintedAt);
    expect(await consumeResetToken(hashResetToken(exactToken.token), expiresAt)).toBeNull();
  });

  it('refuses a token that was never issued', async () => {
    expect(await consumeResetToken(hashResetToken(generateResetToken()), new Date())).toBeNull();
  });

  it('refuses a hash-shaped value that is not a real hash', async () => {
    expect(await consumeResetToken('0'.repeat(64), new Date())).toBeNull();
    expect(await consumeResetToken('', new Date())).toBeNull();
  });
});

describe('a reset invalidates every other outstanding token', () => {
  it('destroys the admin\'s other live links', async () => {
    // The scenario: someone requested three links over the course of an hour, or an
    // attacker requested one and the real owner requested another. Spending any one
    // of them must kill the rest, or the "single use" guarantee only covers one row.
    const { adminId } = await makeAdmin('irmaos');
    const base = new Date('2026-08-08T12:00:00.000Z');
    const first = await mint(adminId, base);
    const second = await mint(adminId, new Date(base.getTime() + 2 * 60 * 1000));
    const third = await mint(adminId, new Date(base.getTime() + 4 * 60 * 1000));
    expect(await listResetTokensFor(adminId)).toHaveLength(3);

    const at = new Date(base.getTime() + 5 * 60 * 1000);
    expect(await consumeResetToken(hashResetToken(third.token), at)).toBe(adminId);
    await invalidateResetTokensFor(adminId);

    expect(await listResetTokensFor(adminId)).toHaveLength(0);
    expect(await consumeResetToken(hashResetToken(first.token), at)).toBeNull();
    expect(await consumeResetToken(hashResetToken(second.token), at)).toBeNull();
  });

  it('leaves other admins\' tokens alone', async () => {
    // Per-account, not global. One secretary resetting must not strand another.
    const mine = await makeAdmin('minhas');
    const theirs = await makeAdmin('deles');
    const now = new Date();
    await mint(mine.adminId, now);
    const theirToken = await mint(theirs.adminId, now);

    await invalidateResetTokensFor(mine.adminId);

    expect(await listResetTokensFor(mine.adminId)).toHaveLength(0);
    expect(await listResetTokensFor(theirs.adminId)).toHaveLength(1);
    expect(await consumeResetToken(hashResetToken(theirToken.token), now)).toBe(theirs.adminId);
  });
});

describe('the per-account request throttle', () => {
  it('mints the first token', async () => {
    const { adminId } = await makeAdmin('primeiro');
    expect((await mint(adminId, new Date())).created).toBe(true);
  });

  it('refuses a second request inside the interval and writes nothing', async () => {
    const { adminId } = await makeAdmin('rapido');
    const base = new Date('2026-08-08T12:00:00.000Z');

    expect((await mint(adminId, base)).created).toBe(true);
    const second = await mint(adminId, new Date(base.getTime() + 5000));

    expect(second.created).toBe(false);
    // The point: no second row, so no second email. The caller must still answer
    // identically — that is enforced in the action, not here.
    expect(await listResetTokensFor(adminId)).toHaveLength(1);
  });

  it('allows another once the interval has passed', async () => {
    const { adminId } = await makeAdmin('depois');
    const base = new Date('2026-08-08T12:00:00.000Z');

    await mint(adminId, base);
    const later = await mint(adminId, new Date(base.getTime() + RESET_REQUEST_MIN_INTERVAL_MS));

    expect(later.created).toBe(true);
    expect(await listResetTokensFor(adminId)).toHaveLength(2);
  });

  it('does not let a spent token hold the throttle open', async () => {
    // A consumed token is not a pending request. If the throttle counted it, someone
    // who just reset their password could not request another link for a minute.
    const { adminId } = await makeAdmin('gasto');
    const base = new Date('2026-08-08T12:00:00.000Z');
    const { token } = await mint(adminId, base);
    await consumeResetToken(hashResetToken(token), base);

    expect((await mint(adminId, new Date(base.getTime() + 1000))).created).toBe(true);
  });

  it('does not let an expired token hold the throttle open', async () => {
    const { adminId } = await makeAdmin('vencido');
    const base = new Date('2026-08-08T12:00:00.000Z');
    await mint(adminId, base);

    const wellAfterExpiry = new Date(base.getTime() + 2 * 60 * 60 * 1000);
    expect((await mint(adminId, wellAfterExpiry)).created).toBe(true);
  });

  it('throttles each admin separately', async () => {
    const a = await makeAdmin('conta-a');
    const b = await makeAdmin('conta-b');
    const base = new Date('2026-08-08T12:00:00.000Z');

    await mint(a.adminId, base);
    expect((await mint(b.adminId, new Date(base.getTime() + 1000))).created).toBe(true);
  });
});

describe('housekeeping', () => {
  it('clears out spent and expired rows instead of accumulating them', async () => {
    const { adminId } = await makeAdmin('limpeza');
    const base = new Date('2026-08-08T12:00:00.000Z');

    const spent = await mint(adminId, base);
    await consumeResetToken(hashResetToken(spent.token), base);
    await mint(adminId, new Date(base.getTime() + 2 * 60 * 1000)); // will expire

    const muchLater = new Date(base.getTime() + 5 * 60 * 60 * 1000);
    await mint(adminId, muchLater);

    // Only the live one survives; the spent and the expired are gone.
    const rows = await listResetTokensFor(adminId);
    expect(rows).toHaveLength(1);
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(muchLater.getTime());
  });

  it('destroys an admin\'s tokens when the admin is removed', async () => {
    // removeStaff deletes the row. An outstanding link for a secretary who no
    // longer works at the church must not survive her account.
    const { adminId } = await makeAdmin('removida');
    const now = new Date();
    const { token } = await mint(adminId, now);

    await client.query('delete from admin_user where id = $1', [adminId]);

    expect(await listResetTokensFor(adminId)).toHaveLength(0);
    expect(await consumeResetToken(hashResetToken(token), now)).toBeNull();
  });

  it('destroys them when the whole church is deleted', async () => {
    const { churchId, adminId } = await makeAdmin('igreja-apagada');
    const now = new Date();
    const { token } = await mint(adminId, now);

    await client.query('delete from church where id = $1', [churchId]);

    expect(await consumeResetToken(hashResetToken(token), now)).toBeNull();
  });
});

describe('cross-tenant', () => {
  it('a token only ever resolves to the admin it was minted for', async () => {
    // Emails are globally unique in this product, so one token maps to one admin
    // and therefore to one church. A token that resolved to the wrong admin would
    // hand somebody another congregation's panel.
    const a = await makeAdmin('igreja-a');
    const b = await makeAdmin('igreja-b');
    const now = new Date();
    const tokenA = await mint(a.adminId, now);
    const tokenB = await mint(b.adminId, now);

    expect(await consumeResetToken(hashResetToken(tokenA.token), now)).toBe(a.adminId);
    expect(await consumeResetToken(hashResetToken(tokenB.token), now)).toBe(b.adminId);
    expect(a.adminId).not.toBe(b.adminId);
    expect(a.churchId).not.toBe(b.churchId);
  });
});
