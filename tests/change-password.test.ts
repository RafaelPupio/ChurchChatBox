import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * Change-your-own-password, the piece that unblocks people today: every church's
 * first admin is currently on a password the vendor generated for them.
 *
 * Same approach as tests/session-guards.test.ts — only the cookie layer is
 * substituted, because iron-session needs a request context that does not exist
 * in a unit test. The mock session object carries a real `save()` spy, so the
 * test can check the thing that is easy to get wrong: that the action RE-SEALS
 * the caller's own cookie with the new epoch. Without that, a secretary who
 * changes her password is thrown out on her very next click by the guard she just
 * invalidated, and to her it looks like the change failed.
 *
 * `next/cache` is stubbed because revalidatePath has no meaning outside a render.
 */

const h = vi.hoisted(() => ({
  session: { adminUserId: '', churchId: '', name: '', pwdAt: undefined as number | undefined },
  cookie: { pwdAt: undefined as number | undefined, save: vi.fn(async () => {}) },
}));

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__changePasswordClient = client;
  return { db: drizzle(client, { schema }) };
});

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual, // the real sessionMatchesPassword, which is what the guard runs
    requireSession: async () => h.session,
    getSession: (async () => h.cookie) as unknown as typeof actual.getSession,
  };
});

const { changePassword } = await import('@/app/admin/(protected)/configuracoes/actions');
const { hashPassword, verifyPassword } = await import('@/lib/auth/password');
const { findAdminById } = await import('@/lib/repo/admin');
const {
  createResetToken,
  listResetTokensFor,
} = await import('@/lib/repo/password-reset');
const { generateResetToken, hashResetToken, resetTokenExpiresAt } = await import('@/lib/auth/reset-token');

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

let client: PGlite;
let originalHash: string;
let counter = 0;

const ORIGINAL_PASSWORD = 'senha-antiga-1';

async function makeAdminAndSignIn(): Promise<{ churchId: string; adminId: string }> {
  counter += 1;
  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,'oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [`Igreja Troca ${counter}`],
  );
  const churchId = c.rows[0].id;
  const a = await client.query<{ id: string }>(
    `insert into admin_user (church_id,email,password_hash,name) values ($1,$2,$3,'Secretária') returning id`,
    [churchId, `troca-${counter}@exemplo.org`, originalHash],
  );
  const adminId = a.rows[0].id;

  const admin = await findAdminById(adminId);
  const pwdAt = admin!.passwordChangedAt.getTime();
  h.session = { adminUserId: adminId, churchId, name: 'Secretária', pwdAt };
  h.cookie.pwdAt = pwdAt;
  h.cookie.save.mockClear();

  return { churchId, adminId };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const good = (next = 'senha-nova-1') =>
  form({ currentPassword: ORIGINAL_PASSWORD, newPassword: next, confirmPassword: next });

beforeAll(async () => {
  originalHash = await hashPassword(ORIGINAL_PASSWORD);
  client = (globalThis as Record<string, unknown>).__changePasswordClient as PGlite;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
});

describe('changing your own password', () => {
  it('replaces the password', async () => {
    const { adminId } = await makeAdminAndSignIn();

    expect(await changePassword({}, good('senha-nova-1'))).toEqual({ ok: true });

    const admin = await findAdminById(adminId);
    expect(await verifyPassword('senha-nova-1', admin!.passwordHash)).toBe(true);
    expect(await verifyPassword(ORIGINAL_PASSWORD, admin!.passwordHash)).toBe(false);
  });

  it('requires the CURRENT password', async () => {
    // Without this, a session someone walked away from on the secretariat's shared
    // computer is enough to lock the real owner out of her own account.
    const { adminId } = await makeAdminAndSignIn();

    const result = await changePassword({}, form({
      currentPassword: 'chute-errado', newPassword: 'senha-nova-2', confirmPassword: 'senha-nova-2',
    }));

    expect(result.ok).toBeUndefined();
    expect(result.error).toMatch(/senha atual/i);
    const admin = await findAdminById(adminId);
    expect(await verifyPassword(ORIGINAL_PASSWORD, admin!.passwordHash)).toBe(true);
  });

  it('refuses a blank current password without touching anything', async () => {
    const { adminId } = await makeAdminAndSignIn();

    const result = await changePassword({}, form({
      currentPassword: '', newPassword: 'senha-nova-3', confirmPassword: 'senha-nova-3',
    }));

    expect(result.error).toMatch(/senha atual/i);
    const admin = await findAdminById(adminId);
    expect(await verifyPassword(ORIGINAL_PASSWORD, admin!.passwordHash)).toBe(true);
  });

  it('refuses a mismatched confirmation', async () => {
    await makeAdminAndSignIn();
    const result = await changePassword({}, form({
      currentPassword: ORIGINAL_PASSWORD, newPassword: 'senha-nova-4', confirmPassword: 'senha-nova-5',
    }));
    expect(result.error).toMatch(/não são iguais/i);
  });

  it('refuses a password below the shared minimum', async () => {
    await makeAdminAndSignIn();
    const result = await changePassword({}, form({
      currentPassword: ORIGINAL_PASSWORD, newPassword: 'curta', confirmPassword: 'curta',
    }));
    expect(result.error).toMatch(/8 caracteres/);
  });

  it('refuses reusing the password she already has', async () => {
    const { adminId } = await makeAdminAndSignIn();

    const result = await changePassword({}, form({
      currentPassword: ORIGINAL_PASSWORD,
      newPassword: ORIGINAL_PASSWORD,
      confirmPassword: ORIGINAL_PASSWORD,
    }));

    expect(result.error).toMatch(/diferente da atual/i);
    const admin = await findAdminById(adminId);
    expect(await verifyPassword(ORIGINAL_PASSWORD, admin!.passwordHash)).toBe(true);
  });

  it('validates BEFORE checking the current password', async () => {
    // Cheap checks first: a mismatched confirmation should not cost a bcrypt
    // compare, and the message should be about the field she actually got wrong.
    await makeAdminAndSignIn();
    const result = await changePassword({}, form({
      currentPassword: 'tambem-errada', newPassword: 'senha-nova-6', confirmPassword: 'outra-coisa-7',
    }));
    expect(result.error).toMatch(/não são iguais/i);
  });
});

describe('what a password change does to sessions', () => {
  it('bumps the epoch, invalidating every session sealed under the old password', async () => {
    const { adminId } = await makeAdminAndSignIn();
    const before = (await findAdminById(adminId))!.passwordChangedAt.getTime();

    await changePassword({}, good('senha-nova-8'));

    const after = (await findAdminById(adminId))!.passwordChangedAt.getTime();
    expect(after).toBeGreaterThan(before);
  });

  it('re-seals the caller\'s OWN cookie so she is not thrown out mid-click', async () => {
    const { adminId } = await makeAdminAndSignIn();

    await changePassword({}, good('senha-nova-9'));

    const after = (await findAdminById(adminId))!.passwordChangedAt.getTime();
    expect(h.cookie.save).toHaveBeenCalledTimes(1);
    expect(h.cookie.pwdAt).toBe(after);
  });

  it('does not re-seal anything when the change is refused', async () => {
    await makeAdminAndSignIn();

    await changePassword({}, form({
      currentPassword: 'errada', newPassword: 'senha-nova-a', confirmPassword: 'senha-nova-a',
    }));

    expect(h.cookie.save).not.toHaveBeenCalled();
  });

  it('leaves every other admin\'s epoch untouched', async () => {
    const mine = await makeAdminAndSignIn();
    const other = await client.query<{ id: string }>(
      `insert into admin_user (church_id,email,password_hash,name) values ($1,$2,$3,'Outra') returning id`,
      [mine.churchId, `troca-outra-${counter}@exemplo.org`, originalHash],
    );
    const otherId = other.rows[0].id;
    const otherBefore = (await findAdminById(otherId))!.passwordChangedAt.getTime();

    await changePassword({}, good('senha-nova-b'));

    expect((await findAdminById(otherId))!.passwordChangedAt.getTime()).toBe(otherBefore);
  });
});

describe('a password change kills outstanding reset links', () => {
  it('destroys them, so a link requested before the change cannot undo it', async () => {
    // The attack this closes: someone requests a reset link for an account, the
    // owner notices and changes her password, and the attacker then spends the
    // still-live link to take it back.
    const { adminId } = await makeAdminAndSignIn();
    const now = new Date();
    const token = generateResetToken();
    await createResetToken({
      adminUserId: adminId,
      tokenHash: hashResetToken(token),
      expiresAt: resetTokenExpiresAt(now),
      now,
    });
    expect(await listResetTokensFor(adminId)).toHaveLength(1);

    await changePassword({}, good('senha-nova-c'));

    expect(await listResetTokensFor(adminId)).toHaveLength(0);
  });

  it('leaves them alone when the change is refused', async () => {
    const { adminId } = await makeAdminAndSignIn();
    const now = new Date();
    await createResetToken({
      adminUserId: adminId,
      tokenHash: hashResetToken(generateResetToken()),
      expiresAt: resetTokenExpiresAt(now),
      now,
    });

    await changePassword({}, form({
      currentPassword: 'errada', newPassword: 'senha-nova-d', confirmPassword: 'senha-nova-d',
    }));

    expect(await listResetTokensFor(adminId)).toHaveLength(1);
  });
});

describe('a suspended church can still change its passwords', () => {
  it('allows it, because account security is not a billing question', async () => {
    // requireWritableSession would refuse — suspension makes the panel read-only.
    // This action deliberately uses the READABLE guard instead: telling a secretary
    // who believes her password is compromised to settle an invoice first is not a
    // defensible answer, and the public reset flow does not check billing either.
    const { churchId, adminId } = await makeAdminAndSignIn();
    await client.query(`update church set status = 'suspended' where id = $1`, [churchId]);

    expect(await changePassword({}, good('senha-nova-e'))).toEqual({ ok: true });

    const admin = await findAdminById(adminId);
    expect(await verifyPassword('senha-nova-e', admin!.passwordHash)).toBe(true);
  });
});

describe('the guard still applies', () => {
  it('redirects when the admin row is gone', async () => {
    const { adminId } = await makeAdminAndSignIn();
    await client.query('delete from admin_user where id = $1', [adminId]);

    await expect(changePassword({}, good('senha-nova-f'))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it('redirects when the cookie carries a stale epoch', async () => {
    await makeAdminAndSignIn();
    h.session = { ...h.session, pwdAt: (h.session.pwdAt ?? 0) - 1 };

    await expect(changePassword({}, good('senha-nova-g'))).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
