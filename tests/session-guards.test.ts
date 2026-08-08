import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * The branch's headline feature — "a suspended church gets a silent bot and a
 * read-only panel" — rests on requireWritableSession, and until now nothing
 * executed it: it was protected by `tsc` alone. A guard that returns the wrong
 * sentinel lets a suspended church keep writing, or locks out a legitimate admin,
 * and neither shows up in a type error.
 *
 * Same approach as tests/repo-isolation.test.ts: substitute the drizzle client
 * with an in-memory Postgres (PGlite) running the real migrations, then call the
 * real guard. Only the cookie layer is mocked — iron-session needs a request
 * context that does not exist in a unit test. Everything below it (the admin
 * lookup, the church lookup, effectiveStatus) runs for real.
 */

const h = vi.hoisted(() => ({
  /** What requireSession() resolves to — i.e. what the cookie claims. */
  session: { adminUserId: '', churchId: '', name: '', pwdAt: undefined as number | undefined },
  /** What getSession() resolves to, for the non-redirecting route-handler guard. */
  cookieSession: {} as {
    kind?: 'admin'; adminUserId?: string; churchId?: string; name?: string; pwdAt?: number;
  },
}));

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__sessionGuardsClient = client;
  return { db: drizzle(client, { schema }) };
});

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual, // keeps the real isAuthenticated — it is the thing under test below
    requireSession: async () => h.session,
    getSession: (async () => h.cookieSession) as unknown as typeof actual.getSession,
  };
});

const {
  checkWritableSession,
  requireReadableSession,
  requireWritableSession,
} = await import('@/lib/auth/writable');
const { setChurchStatus } = await import('@/lib/repo/platform');
const { GRACE_PERIOD_MS } = await import('@/lib/church-status');
const { findAdminById, updateAdminPassword } = await import('@/lib/repo/admin');

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

let client: PGlite;

/** A church plus one admin, in whatever lifecycle state the test needs. */
async function makeChurch(
  name: string,
  status: 'active' | 'past_due' | 'suspended',
  graceUntil: Date | null,
): Promise<{ churchId: string; adminId: string }> {
  const c = await client.query<{ id: string }>(
    `insert into church (name,status,grace_until,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,$2,$3,'oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [name, status, graceUntil],
  );
  const churchId = c.rows[0].id;
  const a = await client.query<{ id: string }>(
    `insert into admin_user (church_id,email,password_hash,name) values ($1,$2,'h','Secretária') returning id`,
    [churchId, `guard-${name}@exemplo.org`],
  );
  return { churchId, adminId: a.rows[0].id };
}

/** Seals a session the way src/app/admin/login/actions.ts does — including the
 *  password epoch, which every guard now compares against the live row.
 *
 *  The epoch is read back through findAdminById, i.e. the exact code path the
 *  guard itself uses, rather than through a raw client.query. Comparing two
 *  values that took the same route through drizzle's timestamptz parsing is the
 *  only way this fixture can prove anything about the real comparison. */
async function signIn(adminUserId: string, churchId: string) {
  const admin = await findAdminById(adminUserId);
  const pwdAt = admin?.passwordChangedAt.getTime();
  h.session = { adminUserId, churchId, name: 'Secretária', pwdAt };
  h.cookieSession = { kind: 'admin', adminUserId, churchId, name: 'Secretária', pwdAt };
}

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__sessionGuardsClient as PGlite;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
});

describe('requireWritableSession', () => {
  it('returns the identity for an active church with a live admin', async () => {
    const { churchId, adminId } = await makeChurch('GuardAtiva', 'active', null);
    await signIn(adminId, churchId);

    const result = await requireWritableSession();
    expect(result).toEqual({ adminUserId: adminId, churchId, name: 'Secretária' });
  });

  it('returns blocked: suspended for a suspended church', async () => {
    const { churchId, adminId } = await makeChurch('GuardSuspensa', 'suspended', null);
    await signIn(adminId, churchId);

    expect(await requireWritableSession()).toEqual({ blocked: 'suspended' });
  });

  it('returns blocked: revoked once the admin row is deleted', async () => {
    const { churchId, adminId } = await makeChurch('GuardRemovida', 'active', null);
    await signIn(adminId, churchId);
    // The removeStaff path: the cookie still seals a valid identity afterwards.
    await client.query('delete from admin_user where id = $1', [adminId]);

    expect(await requireWritableSession()).toEqual({ blocked: 'revoked' });
  });

  it('returns blocked: revoked when the admin no longer belongs to the session church', async () => {
    const a = await makeChurch('GuardIgrejaA', 'active', null);
    const b = await makeChurch('GuardIgrejaB', 'active', null);
    // Cookie says church A; the admin row now says church B. Trusting the cookie
    // here would hand B's staff member A's inbox.
    await signIn(b.adminId, a.churchId);

    expect(await requireWritableSession()).toEqual({ blocked: 'revoked' });
  });

  it('allows writes for a past_due church still inside its grace period', async () => {
    const grace = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const { churchId, adminId } = await makeChurch('GuardEmCarencia', 'past_due', grace);
    await signIn(adminId, churchId);

    expect(await requireWritableSession()).toEqual({
      adminUserId: adminId,
      churchId,
      name: 'Secretária',
    });
  });

  it('returns blocked: suspended once a past_due grace period has expired', async () => {
    const expired = new Date(Date.now() - 60 * 1000);
    const { churchId, adminId } = await makeChurch('GuardCarenciaVencida', 'past_due', expired);
    await signIn(adminId, churchId);

    expect(await requireWritableSession()).toEqual({ blocked: 'suspended' });
  });
});

describe('checkWritableSession (route handlers)', () => {
  it('returns blocked: unauthenticated instead of redirecting when there is no session', async () => {
    // The blob upload route's bug: a redirect() here threw NEXT_REDIRECT, which the
    // route serialised into its JSON body as an "error" message.
    h.cookieSession = {};

    expect(await checkWritableSession()).toEqual({ blocked: 'unauthenticated' });
  });

  it('applies the same suspension check as the Server Action guard', async () => {
    const { churchId, adminId } = await makeChurch('GuardRotaSuspensa', 'suspended', null);
    await signIn(adminId, churchId);

    expect(await checkWritableSession()).toEqual({ blocked: 'suspended' });
  });
});

describe('requireReadableSession', () => {
  it('returns the identity for a live admin', async () => {
    const { churchId, adminId } = await makeChurch('GuardLeituraOk', 'active', null);
    await signIn(adminId, churchId);

    expect(await requireReadableSession()).toEqual({
      adminUserId: adminId,
      churchId,
      name: 'Secretária',
    });
  });

  it('still allows reads for a suspended church — suspension is read-only, not no-access', async () => {
    const { churchId, adminId } = await makeChurch('GuardLeituraSuspensa', 'suspended', null);
    await signIn(adminId, churchId);

    expect(await requireReadableSession()).toEqual({
      adminUserId: adminId,
      churchId,
      name: 'Secretária',
    });
  });

  it('redirects a removed staff member instead of serving member data', async () => {
    const { churchId, adminId } = await makeChurch('GuardLeituraRemovida', 'active', null);
    await signIn(adminId, churchId);
    await client.query('delete from admin_user where id = $1', [adminId]);

    // redirect() signals by throwing; a page cannot render a refusal.
    await expect(requireReadableSession()).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it('redirects when the admin no longer belongs to the session church', async () => {
    const a = await makeChurch('GuardLeituraA', 'active', null);
    const b = await makeChurch('GuardLeituraB', 'active', null);
    await signIn(b.adminId, a.churchId);

    await expect(requireReadableSession()).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

describe('setChurchStatus and the grace period', () => {
  it('writes a grace deadline when a church is marked past_due', async () => {
    const { churchId } = await makeChurch('GuardCarenciaNova', 'active', null);
    const now = new Date('2026-03-01T12:00:00.000Z');

    await setChurchStatus(churchId, 'past_due', now);

    const rows = await client.query<{ status: string; grace_until: Date | null }>(
      'select status, grace_until from church where id = $1',
      [churchId],
    );
    expect(rows.rows[0].status).toBe('past_due');
    expect(rows.rows[0].grace_until).not.toBeNull();
    expect(new Date(rows.rows[0].grace_until!).getTime()).toBe(now.getTime() + GRACE_PERIOD_MS);
  });

  it('clears the grace deadline when the church is reactivated or suspended', async () => {
    const { churchId } = await makeChurch('GuardCarenciaLimpa', 'past_due', new Date());

    for (const status of ['active', 'suspended'] as const) {
      await setChurchStatus(churchId, status);
      const rows = await client.query<{ status: string; grace_until: Date | null }>(
        'select status, grace_until from church where id = $1',
        [churchId],
      );
      expect(rows.rows[0].status).toBe(status);
      expect(rows.rows[0].grace_until).toBeNull();
    }
  });

  it('leaves a freshly past_due church writable, so the grace period is real', async () => {
    const { churchId, adminId } = await makeChurch('GuardCarenciaViva', 'active', null);
    await setChurchStatus(churchId, 'past_due');
    await signIn(adminId, churchId);

    // Before this fix nothing ever wrote grace_until, so this branch of
    // effectiveStatus was dead code and the advertised 7 days did not exist.
    expect(await requireWritableSession()).toEqual({
      adminUserId: adminId,
      churchId,
      name: 'Secretária',
    });
  });
});

/** iron-session is a sealed stateless cookie: there is no server-side session
 *  store, so changing a password cannot delete anybody's session. The password
 *  epoch on admin_user is the substitute, and these are the tests that decide
 *  whether it works — a reset that leaves the intruder's session alive is a reset
 *  that changed the lock and left them inside.
 *
 *  Every case below drives the REAL guards against a REAL Postgres, so it also
 *  covers the thing a pure unit test cannot: that a timestamptz written by
 *  updateAdminPassword and read back by findAdminById survives the round trip
 *  with its milliseconds intact. If that ever stopped holding, every admin would
 *  be logged out on every page load, and only this suite would say so. */
describe('password change ends other sessions', () => {
  it('revokes a writable session sealed before the password changed', async () => {
    const { churchId, adminId } = await makeChurch('GuardSenhaEscrita', 'active', null);
    await signIn(adminId, churchId); // the intruder's cookie

    await updateAdminPassword(adminId, 'novo-hash', new Date(Date.now() + 1000));

    expect(await requireWritableSession()).toEqual({ blocked: 'revoked' });
  });

  it('redirects a READ with a session sealed before the password changed', async () => {
    // Reads matter more than writes here: a stale session that could still read
    // would keep every member phone number, message body and prayer request
    // legible without ever issuing a write.
    const { churchId, adminId } = await makeChurch('GuardSenhaLeitura', 'active', null);
    await signIn(adminId, churchId);

    await updateAdminPassword(adminId, 'novo-hash', new Date(Date.now() + 1000));

    await expect(requireReadableSession()).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it('revokes at the route-handler guard too', async () => {
    const { churchId, adminId } = await makeChurch('GuardSenhaRota', 'active', null);
    await signIn(adminId, churchId);

    await updateAdminPassword(adminId, 'novo-hash', new Date(Date.now() + 1000));

    expect(await checkWritableSession()).toEqual({ blocked: 'revoked' });
  });

  it('keeps the session that re-sealed itself with the new epoch', async () => {
    // What changePassword does for the browser doing the changing: she must not be
    // thrown out of the tab she is sitting in, or the change reads as a failure.
    const { churchId, adminId } = await makeChurch('GuardSenhaPropria', 'active', null);
    await signIn(adminId, churchId);

    await updateAdminPassword(adminId, 'novo-hash', new Date(Date.now() + 1000));
    await signIn(adminId, churchId); // re-seal, as the action does

    expect(await requireWritableSession()).toEqual({
      adminUserId: adminId,
      churchId,
      name: 'Secretária',
    });
  });

  it('rejects a cookie carrying no epoch at all', async () => {
    // A session sealed by a build from before this field existed. Grandfathering
    // those would leave a documented bypass in the codebase forever; the cost of
    // rejecting them is one extra login at deploy time.
    const { churchId, adminId } = await makeChurch('GuardSenhaSemEpoca', 'active', null);
    await signIn(adminId, churchId);
    h.session = { ...h.session, pwdAt: undefined };
    h.cookieSession = { ...h.cookieSession, pwdAt: undefined };

    expect(await requireWritableSession()).toEqual({ blocked: 'revoked' });
    expect(await checkWritableSession()).toEqual({ blocked: 'revoked' });
    await expect(requireReadableSession()).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it('rejects an epoch that is close but not equal', async () => {
    // Exact equality, not "newer than": the value is copied from the row, so one
    // millisecond of difference means this cookie predates the current password.
    const { churchId, adminId } = await makeChurch('GuardSenhaQuaseIgual', 'active', null);
    await signIn(adminId, churchId);
    h.session = { ...h.session, pwdAt: (h.session.pwdAt ?? 0) + 1 };

    expect(await requireWritableSession()).toEqual({ blocked: 'revoked' });
  });

  it('leaves every OTHER admin signed in', async () => {
    // The epoch is per-account. One secretary resetting her password must not sign
    // out the rest of the church office.
    const { churchId, adminId } = await makeChurch('GuardSenhaOutra', 'active', null);
    const other = await client.query<{ id: string }>(
      `insert into admin_user (church_id,email,password_hash,name) values ($1,$2,'h','Secretária') returning id`,
      [churchId, 'guard-outra-conta@exemplo.org'],
    );
    const otherId = other.rows[0].id;

    await updateAdminPassword(adminId, 'novo-hash', new Date(Date.now() + 1000));
    await signIn(otherId, churchId);

    expect(await requireWritableSession()).toEqual({
      adminUserId: otherId,
      churchId,
      name: 'Secretária',
    });
  });

  it('reports null when the admin row is gone, instead of a phantom success', async () => {
    // Without transactions, an account can be removed between the check that
    // found it and the write. A caller that read this as success would tell
    // someone "your new password is active" about a password nobody stored.
    const { adminId } = await makeChurch('GuardSenhaFantasma', 'active', null);
    await client.query('delete from admin_user where id = $1', [adminId]);

    expect(await updateAdminPassword(adminId, 'hash-orfao', new Date())).toBeNull();
  });

  it('round-trips the epoch through Postgres without losing milliseconds', async () => {
    // The comparison is exact equality on a timestamptz. If drizzle's parse ever
    // dropped or rounded the millisecond field, sessionMatchesPassword would
    // return false for a session sealed one line earlier and nobody could stay
    // logged in for a single page load.
    const { churchId, adminId } = await makeChurch('GuardSenhaPrecisao', 'active', null);
    const changedAt = new Date('2026-08-08T12:34:56.789Z');

    await updateAdminPassword(adminId, 'novo-hash', changedAt);
    const admin = await findAdminById(adminId);

    expect(admin?.passwordChangedAt.getTime()).toBe(changedAt.getTime());
    expect(admin?.passwordChangedAt.getMilliseconds()).toBe(789);

    await signIn(adminId, churchId);
    expect(await requireWritableSession()).toEqual({
      adminUserId: adminId,
      churchId,
      name: 'Secretária',
    });
  });
});
