import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * The two PUBLIC Server Actions, end to end: request a link, then spend it.
 *
 * These two turned out to be genuinely testable, unlike most Server Actions in
 * this repo — neither touches cookies(), headers() or redirect(), so nothing here
 * needs a request context. Only the outermost edge is substituted: the database
 * becomes an in-memory Postgres running the real migrations, and the email
 * transport becomes a spy so the test can read the link a church volunteer would
 * receive. Everything between them — the token, the SHA-256, the atomic consuming
 * UPDATE, bcrypt, the expiry rule — is the real code.
 *
 * NOT covered here, and not coverable: the pages that render these forms. A page
 * needs Next's rendering runtime, and this repo has neither jsdom nor a browser
 * harness. `npm run build` type-checks and compiles them; the rest is manual.
 */

const h = vi.hoisted(() => ({ send: vi.fn(async (_to: string, _link: string) => {}) }));

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__resetActionsClient = client;

  // Counts the statements the APPLICATION sends, so a test can assert how many
  // round trips a branch costs. On neon-http every statement is its own HTTPS
  // request, which is the unit this flow's timing is made of; PGlite is in-process
  // and cannot show that in a stopwatch, but it can show it in a count. The
  // fixtures below hold `client` itself and are deliberately not counted.
  const statements = { count: 0 };
  (globalThis as Record<string, unknown>).__resetActionsStatements = statements;
  const counted = new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const bound = (value as (...a: unknown[]) => unknown).bind(target);
      if (prop !== 'query' && prop !== 'exec') return bound;
      return (...args: unknown[]) => {
        statements.count += 1;
        return bound(...args);
      };
    },
  });
  return { db: drizzle(counted, { schema }) };
});

vi.mock('@/lib/email', () => ({ sendPasswordResetEmail: h.send }));

const { requestPasswordReset } = await import('@/app/admin/esqueci-senha/actions');
const { resetPassword } = await import('@/app/admin/redefinir-senha/actions');
const { RESET_REQUESTED_MESSAGE, LINK_UNUSABLE_MESSAGE } = await import('@/lib/auth/reset-messages');
const { RESET_RESPONSE_FLOOR_MS } = await import('@/lib/auth/reset-token');
const { verifyPassword } = await import('@/lib/auth/password');
const { findAdminById } = await import('@/lib/repo/admin');
const { listResetTokensFor } = await import('@/lib/repo/password-reset');

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

let client: PGlite;
let counter = 0;

const ORIGINAL_PASSWORD = 'senha-antiga-1';

/** Hashed ONCE for the whole suite and reused by every fixture admin.
 *
 *  bcrypt at cost 12 is ~300ms by design, and the fixture would otherwise pay it
 *  for every admin it creates — several seconds spent proving nothing, since what
 *  these tests care about is only that the stored hash verifies ORIGINAL_PASSWORD.
 *  The hashes the tests actually examine are the ones the production code writes,
 *  and those are computed for real. */
let originalHash: string;

async function makeAdmin(): Promise<{ churchId: string; adminId: string; email: string }> {
  counter += 1;
  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,'oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [`Igreja Acao ${counter}`],
  );
  const churchId = c.rows[0].id;
  const email = `acao-${counter}@exemplo.org`;
  const a = await client.query<{ id: string }>(
    `insert into admin_user (church_id,email,password_hash,name) values ($1,$2,$3,'Secretária') returning id`,
    [churchId, email, originalHash],
  );
  return { churchId, adminId: a.rows[0].id, email };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** The token as it appears in the emailed link — i.e. what the volunteer clicks. */
function tokenFromLastEmail(): string {
  const [, link] = h.send.mock.calls.at(-1) as [string, string];
  return new URL(link).searchParams.get('token') ?? '';
}

beforeAll(async () => {
  const { hashPassword } = await import('@/lib/auth/password');
  originalHash = await hashPassword(ORIGINAL_PASSWORD);

  client = (globalThis as Record<string, unknown>).__resetActionsClient as PGlite;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
});

beforeEach(() => {
  h.send.mockClear();
});

describe('requesting a link says the same thing either way', () => {
  it('answers a registered address with the standard message', async () => {
    const { email } = await makeAdmin();
    const result = await requestPasswordReset({}, form({ email }));

    expect(result).toEqual({ sent: true });
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('answers an UNREGISTERED address with the byte-identical message', async () => {
    // The account-existence oracle. Emails are globally unique here, so a form
    // that confirmed an address existed would also confirm that this person
    // administers some church — sensitive personal data for a religious body.
    const known = await makeAdmin();
    const forKnown = await requestPasswordReset({}, form({ email: known.email }));
    h.send.mockClear();

    const forUnknown = await requestPasswordReset({}, form({ email: 'ninguem@exemplo.org' }));

    expect(forUnknown).toEqual(forKnown);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('answers identically when the throttle refuses a second request', async () => {
    // A different answer here would leak just as much: "throttled" only ever
    // happens to an address that exists.
    const { email } = await makeAdmin();
    const first = await requestPasswordReset({}, form({ email }));
    const second = await requestPasswordReset({}, form({ email }));

    expect(second).toEqual(first);
    // Same message, but only ONE email actually left.
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('answers identically when the transport is down', async () => {
    const { email } = await makeAdmin();
    h.send.mockRejectedValueOnce(new Error('provider down'));

    expect(await requestPasswordReset({}, form({ email }))).toEqual({ sent: true });
  });

  it('answers identically for a malformed or absurdly long address', async () => {
    expect(await requestPasswordReset({}, form({ email: 'não é um e-mail' }))).toEqual({ sent: true });
    expect(await requestPasswordReset({}, form({ email: 'a'.repeat(5000) }))).toEqual({ sent: true });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('refuses a BLANK field, which reveals nothing about any account', async () => {
    const result = await requestPasswordReset({}, form({ email: '   ' }));
    expect(result.sent).toBeUndefined();
    expect(result.error).toMatch(/e-mail/i);
  });

  it('says something honest and in Brazilian Portuguese', async () => {
    // Honest: conditional, because it does not know. Useful: it tells someone who
    // mistyped her own address what to do instead of leaving her waiting.
    expect(RESET_REQUESTED_MESSAGE).toMatch(/^Se este e-mail estiver cadastrado/);
    expect(RESET_REQUESTED_MESSAGE).toMatch(/spam/i);
    expect(RESET_REQUESTED_MESSAGE).toMatch(/confira se digitou/i);
    expect(RESET_REQUESTED_MESSAGE).not.toMatch(/\b(if|account|exists|email address)\b/i);
  });
});

describe('requesting a link costs the same ROUND TRIPS either way', () => {
  /** Statements the application has sent so far. */
  const sent = () =>
    ((globalThis as Record<string, unknown>).__resetActionsStatements as { count: number }).count;

  it('issues exactly ONE database statement, for a known address and an unknown one', async () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL BUG, and the one the
    // timing test below cannot make. Timing is unavailable in a unit test — PGlite
    // answers in microseconds and the floor swallows everything — but the cause is
    // countable. Before this was fixed the numbers here were 4 and 1: a lookup, a
    // purge, a throttle read and an insert against a single lookup, four separate
    // HTTPS requests against one, ~725ms against ~180ms on the real database.
    //
    // Equal counts is the invariant. Anything added to the "address exists" branch
    // that talks to the database — an audit row, a second lookup, a "have they
    // logged in lately" check — breaks this test before it can reach production
    // and reopen the oracle.
    const { email } = await makeAdmin();

    const beforeKnown = sent();
    await requestPasswordReset({}, form({ email }));
    const known = sent() - beforeKnown;

    const beforeUnknown = sent();
    await requestPasswordReset({}, form({ email: 'ninguem-contagem@exemplo.org' }));
    const unknown = sent() - beforeUnknown;

    expect(known).toBe(unknown);
    expect(known).toBe(1);
  });

  it('still issues exactly one when the throttle refuses', async () => {
    // The throttle lives inside that same statement now. A refusal must not become
    // a branch with a different cost — "throttled" only ever happens to an address
    // that exists, so a cheaper or costlier refusal is an oracle on its own.
    const { email } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));

    const before = sent();
    await requestPasswordReset({}, form({ email }));

    expect(sent() - before).toBe(1);
  });

  it('issues NONE for input too long to be an address, which the floor covers', async () => {
    // RFC 5321 caps an address at 254 characters, so this cannot be one and never
    // reaches the database. Zero statements against one is a real difference in
    // work — it is the one difference the response floor is still there to hide,
    // and it says nothing about any account because no account can have this
    // address.
    const before = sent();
    await requestPasswordReset({}, form({ email: 'a'.repeat(5000) }));

    expect(sent() - before).toBe(0);
  });
});

describe('requesting a link takes the same TIME either way', () => {
  it('holds both branches to the response floor', async () => {
    // The login action equalises with a decoy bcrypt hash. This one cannot — its
    // expensive branch does a database INSERT, and there is no honest decoy for an
    // INSERT whose foreign key points at an admin that does not exist — so it
    // equalises with a floor on the whole response instead.
    const { email } = await makeAdmin();

    const knownStart = Date.now();
    await requestPasswordReset({}, form({ email }));
    const knownElapsed = Date.now() - knownStart;

    const unknownStart = Date.now();
    await requestPasswordReset({}, form({ email: 'ninguem-mesmo@exemplo.org' }));
    const unknownElapsed = Date.now() - unknownStart;

    // Timer granularity, not a fudge factor: setTimeout may fire a millisecond early.
    const tolerance = 25;
    expect(knownElapsed).toBeGreaterThanOrEqual(RESET_RESPONSE_FLOOR_MS - tolerance);
    expect(unknownElapsed).toBeGreaterThanOrEqual(RESET_RESPONSE_FLOOR_MS - tolerance);

    // The property that matters: an attacker cannot tell the branches apart by
    // stopwatch. Without the floor the unknown branch returns in single-digit ms
    // while the known branch pays for an insert.
    expect(Math.abs(knownElapsed - unknownElapsed)).toBeLessThan(150);
  });
});

describe('a flood does not get to pin a paid function per request', () => {
  /** Fires `size` requests that all reach the endpoint before any of them answers,
   *  and reports for each whether it came back far too fast to have waited out the
   *  response floor — i.e. whether it was shed. */
  async function burst(address: string, size = 12) {
    return Promise.all(
      Array.from({ length: size }, async () => {
        const startedAt = Date.now();
        const result = await requestPasswordReset({}, form({ email: address }));
        return { result, shed: Date.now() - startedAt < RESET_RESPONSE_FLOOR_MS / 2 };
      }),
    );
  }

  it('refuses the excess instantly instead of sleeping through it', async () => {
    // The endpoint is unauthenticated, does a database round trip, and then sleeps
    // on purpose. The per-account throttle caps EMAILS to a registered address and
    // caps nothing at all for the invented addresses an attacker would actually
    // send, so without a cap every junk request buys a paid function for the whole
    // floor. Above the cap the answer is immediate, which is what makes the flood
    // cheap to absorb rather than expensive to serve.
    const { email } = await makeAdmin();

    const responses = await burst(email);

    expect(responses.every((r) => r.result.sent === true)).toBe(true);
    expect(responses.filter((r) => r.shed).length).toBeGreaterThan(0);
    expect(responses.filter((r) => !r.shed).length).toBeGreaterThan(0);
  });

  it('decides before it looks at the address, so the fast refusal leaks nothing', async () => {
    // The property that keeps the shed from becoming the very oracle this flow
    // exists to avoid: the same burst against a registered address and against a
    // fictional one is refused the same number of times, and every answer is the
    // one message this form ever gives.
    const { email } = await makeAdmin();

    const known = await burst(email);
    const unknown = await burst('ninguem-rajada@exemplo.org');

    expect(known.filter((r) => r.shed).length).toBe(unknown.filter((r) => r.shed).length);
    expect(known.map((r) => r.result)).toEqual(unknown.map((r) => r.result));
  });

  it('hands every slot back, so the next visitor is not punished for the flood', async () => {
    const { email } = await makeAdmin();
    await burst(email);

    // A single request after the burst behaves completely normally: it waits out
    // the floor rather than being refused, which it could not do if the burst had
    // leaked its slots.
    const startedAt = Date.now();
    const after = await requestPasswordReset({}, form({ email: 'depois-da-rajada@exemplo.org' }));

    expect(after).toEqual({ sent: true });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(RESET_RESPONSE_FLOOR_MS - 25);
  });
});

describe('the emailed link', () => {
  it('goes to the address on the account and carries a usable token', async () => {
    const { email } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));

    const [to, link] = h.send.mock.calls[0] as [string, string];
    expect(to).toBe(email);
    expect(link).toContain('/admin/redefinir-senha?token=');
    expect(tokenFromLastEmail()).toHaveLength(43);
  });

  it('is not the value stored in the database', async () => {
    // The whole reason the token is hashed. This asserts it across the real
    // boundary rather than in isolation.
    const { email, adminId } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));

    const stored = await listResetTokensFor(adminId);
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(tokenFromLastEmail());
    expect(JSON.stringify(stored)).not.toContain(tokenFromLastEmail());
  });
});

describe('spending the link', () => {
  it('changes the password to the new one', async () => {
    const { email, adminId } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));
    const token = tokenFromLastEmail();

    const result = await resetPassword({}, form({ token, password: 'senha-nova-1', confirmation: 'senha-nova-1' }));

    expect(result).toEqual({ ok: true });
    const admin = await findAdminById(adminId);
    expect(await verifyPassword('senha-nova-1', admin!.passwordHash)).toBe(true);
    expect(await verifyPassword(ORIGINAL_PASSWORD, admin!.passwordHash)).toBe(false);
  });

  it('bumps the session epoch, which is what ends other sessions', async () => {
    const { email, adminId } = await makeAdmin();
    const before = (await findAdminById(adminId))!.passwordChangedAt.getTime();
    await requestPasswordReset({}, form({ email }));

    await resetPassword({}, form({
      token: tokenFromLastEmail(), password: 'senha-nova-2', confirmation: 'senha-nova-2',
    }));

    const after = (await findAdminById(adminId))!.passwordChangedAt.getTime();
    expect(after).toBeGreaterThan(before);
  });

  it('works exactly once', async () => {
    const { email } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));
    const token = tokenFromLastEmail();

    expect(await resetPassword({}, form({ token, password: 'senha-nova-3', confirmation: 'senha-nova-3' })))
      .toEqual({ ok: true });
    expect(await resetPassword({}, form({ token, password: 'outra-senha-9', confirmation: 'outra-senha-9' })))
      .toEqual({ error: LINK_UNUSABLE_MESSAGE });
  });

  it('leaves the first new password in place when the link is replayed', async () => {
    // The replay must not merely be refused — it must not have written anything.
    const { email, adminId } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));
    const token = tokenFromLastEmail();

    await resetPassword({}, form({ token, password: 'senha-nova-4', confirmation: 'senha-nova-4' }));
    await resetPassword({}, form({ token, password: 'sequestrada-9', confirmation: 'sequestrada-9' }));

    const admin = await findAdminById(adminId);
    expect(await verifyPassword('senha-nova-4', admin!.passwordHash)).toBe(true);
    expect(await verifyPassword('sequestrada-9', admin!.passwordHash)).toBe(false);
  });

  it('destroys every OTHER outstanding link for that admin', async () => {
    // Two links in flight — say an attacker requested one and the owner requested
    // another. Spending either must kill the other.
    const { email, adminId } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));
    const firstToken = tokenFromLastEmail();

    // Reach past the one-a-minute throttle to get a genuine second live link.
    await client.query(
      `update password_reset_token set created_at = created_at - interval '5 minutes' where admin_user_id = $1`,
      [adminId],
    );
    await requestPasswordReset({}, form({ email }));
    const secondToken = tokenFromLastEmail();
    expect(secondToken).not.toBe(firstToken);
    expect(await listResetTokensFor(adminId)).toHaveLength(2);

    await resetPassword({}, form({
      token: secondToken, password: 'senha-nova-5', confirmation: 'senha-nova-5',
    }));

    expect(await listResetTokensFor(adminId)).toHaveLength(0);
    expect(await resetPassword({}, form({
      token: firstToken, password: 'sequestrada-9', confirmation: 'sequestrada-9',
    }))).toEqual({ error: LINK_UNUSABLE_MESSAGE });
  });

  it('refuses a token nobody issued', async () => {
    const { generateResetToken } = await import('@/lib/auth/reset-token');
    expect(await resetPassword({}, form({
      token: generateResetToken(), password: 'senha-nova-6', confirmation: 'senha-nova-6',
    }))).toEqual({ error: LINK_UNUSABLE_MESSAGE });
  });

  it('refuses a missing token', async () => {
    expect(await resetPassword({}, form({ password: 'senha-nova-7', confirmation: 'senha-nova-7' })))
      .toEqual({ error: LINK_UNUSABLE_MESSAGE });
  });

  it('gives the same message for every way a link can fail', async () => {
    // Unknown, spent, expired, malformed — one message. Telling them apart would
    // tell whoever holds a token which case it is.
    const { email } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));
    const token = tokenFromLastEmail();
    await resetPassword({}, form({ token, password: 'senha-nova-8', confirmation: 'senha-nova-8' }));

    const spent = await resetPassword({}, form({ token, password: 'qualquer-1x', confirmation: 'qualquer-1x' }));
    const unknown = await resetPassword({}, form({ token: 'inexistente', password: 'qualquer-1x', confirmation: 'qualquer-1x' }));
    const missing = await resetPassword({}, form({ token: '', password: 'qualquer-1x', confirmation: 'qualquer-1x' }));

    expect(spent).toEqual(unknown);
    expect(unknown).toEqual(missing);
  });

  it('rejects an expired link', async () => {
    const { email, adminId } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));
    const token = tokenFromLastEmail();
    await client.query(
      `update password_reset_token set expires_at = now() - interval '1 minute' where admin_user_id = $1`,
      [adminId],
    );

    expect(await resetPassword({}, form({ token, password: 'senha-nova-9', confirmation: 'senha-nova-9' })))
      .toEqual({ error: LINK_UNUSABLE_MESSAGE });
    const admin = await findAdminById(adminId);
    expect(await verifyPassword(ORIGINAL_PASSWORD, admin!.passwordHash)).toBe(true);
  });

  it('does NOT burn the link on a mistyped confirmation', async () => {
    // The reason validation runs before consumption. Burning a single-use link
    // because two fields disagree sends a volunteer back to her inbox for a link
    // she cannot get for another minute.
    const { email } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));
    const token = tokenFromLastEmail();

    const typo = await resetPassword({}, form({ token, password: 'senha-nova-a', confirmation: 'senha-nova-b' }));
    expect(typo.error).toBeTruthy();
    expect(typo.error).not.toBe(LINK_UNUSABLE_MESSAGE);

    // The link still works.
    expect(await resetPassword({}, form({ token, password: 'senha-nova-a', confirmation: 'senha-nova-a' })))
      .toEqual({ ok: true });
  });

  it('does NOT burn the link on a too-short password', async () => {
    const { email } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));
    const token = tokenFromLastEmail();

    expect((await resetPassword({}, form({ token, password: 'curta', confirmation: 'curta' }))).error)
      .toBeTruthy();
    expect(await resetPassword({}, form({ token, password: 'senha-longa-1', confirmation: 'senha-longa-1' })))
      .toEqual({ ok: true });
  });

  it('never signs the visitor in', async () => {
    // Completing this proves only that someone can read one mailbox, and admin
    // addresses in this product are never verified. The last step is a normal
    // login — which also confirms to her that the new password works.
    const { email } = await makeAdmin();
    await requestPasswordReset({}, form({ email }));
    const result = await resetPassword({}, form({
      token: tokenFromLastEmail(), password: 'senha-nova-c', confirmation: 'senha-nova-c',
    }));

    expect(Object.keys(result)).toEqual(['ok']);
  });

  it('speaks Brazilian Portuguese when it refuses', async () => {
    expect(LINK_UNUSABLE_MESSAGE).toMatch(/não funciona mais/);
    expect(LINK_UNUSABLE_MESSAGE).toMatch(/1 hora/);
    expect(LINK_UNUSABLE_MESSAGE).toMatch(/Esqueci minha senha/);
    expect(LINK_UNUSABLE_MESSAGE).not.toMatch(/\b(token|expired|invalid|link)\b/i);
  });
});

describe('one admin\'s reset does not touch another', () => {
  it('leaves the other church\'s admin on their old password', async () => {
    const mine = await makeAdmin();
    const theirs = await makeAdmin();
    await requestPasswordReset({}, form({ email: mine.email }));

    await resetPassword({}, form({
      token: tokenFromLastEmail(), password: 'senha-nova-d', confirmation: 'senha-nova-d',
    }));

    const other = await findAdminById(theirs.adminId);
    expect(await verifyPassword(ORIGINAL_PASSWORD, other!.passwordHash)).toBe(true);
    expect(await verifyPassword('senha-nova-d', other!.passwordHash)).toBe(false);
  });
});
