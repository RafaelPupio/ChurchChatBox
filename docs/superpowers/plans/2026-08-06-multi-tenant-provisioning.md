# Multi-Church Plan 1 — Provisioning + Owner Console

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app genuinely multi-church — any number of churches can be provisioned, each isolated, each connected to WhatsApp and suspended/reactivated by Rafael from an owner console that no church admin can reach.

**Architecture:** Tenancy already exists (`church_id` on every child table, webhook routes by `phone_number_id`). This plan removes the three single-church assumptions, adds a church lifecycle (`active` / `past_due` / `suspended`) computed on read by a pure function, and adds a separate `owner_user` table with its own `/owner` login and session — structurally distinct from church admin auth, not a role flag. The cross-tenant isolation suite moves into the repo's normal test run as standing evidence.

**Tech Stack:** Next.js 15 (App Router, Server Actions) · React 19 · TypeScript strict · Drizzle + Neon · iron-session · bcryptjs · Vitest · PGlite (test-only, real Postgres in-process)

**Scope:** Subsystems 1 and 2 of the spec. **Stripe billing and LGPD tooling are separate later plans.** Nothing here talks to Stripe; `status` is set manually from the owner console, and `stripe_*` columns are created now only to avoid a second migration later.

**Spec:** `docs/superpowers/specs/2026-08-06-multi-church-saas-design.md`

## Global Constraints

- **Every church-facing query stays scoped by `church_id` from the session**, never from client input. Owner-level queries deliberately span churches and therefore live in a separate file (`src/lib/repo/platform.ts`). **That boundary is enforced by an automated test, not by a comment** — this repo has no ESLint, so nothing else would stop church-facing code importing a cross-church query that returns another tenant's `accessToken`.
- **Owner auth is structurally separate from church auth.** A distinct `owner_user` table (no `church_id`), a distinct cookie (`sv_owner`), a distinct guard, **and an explicit `kind` discriminator on both session payloads**. Both sessions are sealed with the same `SESSION_SECRET` and iron-session does not bind a seal to a cookie name, so without `kind` the isolation would rest only on the two interfaces happening to use different field names.
- **Guards verify the identity still exists.** A session cookie proves who you *were*. `removeStaff` can delete an `admin_user` row, and a removed admin must not keep read/write access to a church's member data until their cookie expires.
- **`SESSION_SECRET` is read lazily** inside session helpers, never at module scope, so `next build` does not require it.
- **The bot must never be silenced by missing data.** `past_due` with a null `grace_until` reads as `past_due` (bot keeps running), never as suspended.
- **A suspended church still records inbound messages** — only outbound sending stops. No member data is lost while a church is unpaid.
- **No user-facing bot string is hardcoded.** Every string the bot emits comes from a `church` column or a `menu_item` row. Panel/owner-console chrome in pt-BR is correct — that is the app's own interface.
- **All UI text is pt-BR** (panel, owner console, errors). Code identifiers, comments, tests and docs are English.
- **The seeded Privacidade item must not promise a mechanism that does not exist.** The automated data-subject request flow is the later LGPD plan; this plan's text directs members to contact the church.
- **`drizzle-orm` stays ≥ 0.45.2.** The neon-http driver has **no transaction support** — `db.transaction()` throws.
- **Deferred live verification:** there is still no Neon database. Pure logic is unit-tested; the isolation suite runs against PGlite; everything DB/HTTP/browser-backed is gated by `npm run typecheck` and `npm run build`. Each such task's report must state plainly that its DB/HTTP path never executed.
- **Never commit `.env`.** TypeScript strict. Node 20+.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/db/schema.ts` | Add `churchStatusEnum`, four `church` columns, `ownerUser` table (modify) |
| `drizzle/0001_*.sql` | Generated migration |
| `src/lib/church-status.ts` | Pure `effectiveStatus()` + grace constant — tested |
| `src/lib/church-defaults.ts` | The pt-BR default bot strings + the seeded Privacidade item |
| `src/lib/provisioning.ts` | `provisionChurch()` — the one path that creates a church |
| `src/lib/repo/platform.ts` | **Owner-level** cross-church queries (privilege boundary) |
| `src/lib/repo/owner.ts` | `owner_user` queries |
| `src/lib/auth/owner-session.ts` | Owner session + guard, separate cookie |
| `src/lib/auth/writable.ts` | `requireWritableSession()` — session + identity + not-suspended |
| `src/app/owner/login/*` | Owner login (unguarded) |
| `src/app/owner/(protected)/*` | Guarded owner console: church list, **new-church form**, church detail |
| `scripts/create-owner.ts` | Bootstrap the first owner login |
| `scripts/create-church.ts` | Provision a church from the CLI |
| `scripts/create-admin.ts` | Multi-church-safe, accepts `--church <id>` (modify) |
| `src/db/seed.ts` | Local dev fixture, reuses shared defaults (modify) |
| `src/app/admin/(protected)/configuracoes/*` | WhatsApp becomes read-only status (modify) |
| `src/app/admin/(protected)/caixa/[contactId]/EndHandoffButton.tsx` | Read the action's returned error (modify) |
| `src/app/api/whatsapp/webhook/route.ts` | Suspended → record, don't send (modify) |
| `src/app/api/blob/upload/route.ts` | Suspended → no upload token (modify) |
| `tests/church-status.test.ts` | Pure status tests |
| `tests/tenant-isolation.test.ts` | Two-church attack suite against real Postgres |
| `tests/provisioning.test.ts` | Two provisioned churches are independent |
| `tests/privilege-boundary.test.ts` | Church-facing code never imports `repo/platform` |

**Routes:** `/owner/login`, `/owner` (church list + new church), `/owner/[churchId]` (detail). The `(protected)` route group does not appear in URLs, and `login/` sits **outside** it so the guard never runs for the login page — the same structure, and the same English identifier, as `/admin`.

## Interfaces Reference (canonical — every task matches these exactly)

```ts
// src/lib/church-status.ts
export type ChurchStatus = 'active' | 'past_due' | 'suspended';
export const GRACE_PERIOD_MS: number;                    // 7 days
export function effectiveStatus(status: ChurchStatus, graceUntil: Date | null, now: Date): ChurchStatus;

// src/lib/church-defaults.ts
export const CHURCH_DEFAULTS: { name: string; greetingText: string; menuHeaderText: string; menuButtonLabel: string; fallbackText: string; unsupportedMediaText: string; errorText: string; prayerPromptText: string; prayerThanksText: string; handoffText: string; handoffClosedText: string };
export const PRIVACY_ITEM: { position: number; label: string; bodyText: string; kind: 'content' };

// src/lib/provisioning.ts
export function provisionChurch(name: string, adminEmail: string, password: string): Promise<{ churchId: string; adminUserId: string }>;

// src/lib/repo/platform.ts   (OWNER-ONLY — spans churches by design)
export interface ChurchSummary { id: string; name: string; status: ChurchStatus; graceUntil: Date | null; whatsappConnected: boolean; activeMenuItems: number; lastInboundAt: Date | null; createdAt: Date }
export function listChurches(): Promise<ChurchSummary[]>;
export function getChurchForOwner(churchId: string): Promise<typeof import('@/db/schema').church.$inferSelect | undefined>;
export function setChurchCredentials(churchId: string, fields: { phoneNumberId?: string; accessToken?: string; appSecret?: string; webhookVerifyToken?: string }): Promise<void>;
export function setChurchStatus(churchId: string, status: ChurchStatus): Promise<void>;
export function getOnlyChurch(): Promise<typeof import('@/db/schema').church.$inferSelect | undefined>;  // exactly one church, else undefined

// src/lib/repo/owner.ts
export type OwnerRecord = typeof import('@/db/schema').ownerUser.$inferSelect;
export function findOwnerByEmail(email: string): Promise<OwnerRecord | undefined>;
export function findOwnerById(id: string): Promise<OwnerRecord | undefined>;
export function createOwner(o: { email: string; passwordHash: string; name: string | null }): Promise<OwnerRecord>;

// src/lib/repo/admin.ts  (added to the existing file)
export function findAdminById(id: string): Promise<AdminRecord | undefined>;

// src/lib/auth/owner-session.ts
export interface OwnerSessionData { kind?: 'owner'; ownerUserId?: string; name?: string }
export function isOwnerAuthenticated(s: Pick<OwnerSessionData, 'kind' | 'ownerUserId'>): boolean;   // requires kind === 'owner'
export function getOwnerSession(): Promise<import('iron-session').IronSession<OwnerSessionData>>;
export function requireOwnerSession(): Promise<{ ownerUserId: string; name: string }>;   // redirects to /owner/login if absent OR the owner row is gone

// src/lib/auth/writable.ts
export function requireWritableSession(): Promise<{ adminUserId: string; churchId: string; name: string } | { blocked: 'suspended' | 'revoked' }>;
export const SUSPENDED_MESSAGE: string;
export const REVOKED_MESSAGE: string;

// src/app/owner/(protected)/actions.ts
export function createChurch(prev: NewChurchState, formData: FormData): Promise<NewChurchState>;   // owner-guarded caller of provisionChurch

// consumed from existing code (already on main):
// requireSession(): Promise<{ adminUserId: string; churchId: string; name: string }>   — @/lib/auth/session
// hashPassword / verifyPassword                                                        — @/lib/auth/password
// getChurchById(churchId)                                                              — @/lib/repo/church-admin
```

---

### Task 1: Schema — church lifecycle + owner_user

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0001_*.sql` (generated)

**Interfaces:**
- Consumes: nothing
- Produces: `churchStatusEnum`; `church.status` / `.stripeCustomerId` / `.stripeSubscriptionId` / `.graceUntil`; `ownerUser` table

**No live DB.** Gate: `npm run typecheck` + `npm run db:generate`. The migration is not applied here.

- [ ] **Step 1: Add the status enum**

In `src/db/schema.ts`, beside the existing enums:
```ts
export const churchStatusEnum = pgEnum('church_status', ['active', 'past_due', 'suspended']);
```

- [ ] **Step 2: Add the four church columns**

In the `church` table definition, immediately after `appSecret`:
```ts
  // Subscription lifecycle. Stripe writes these in a later plan; until then the
  // owner console sets status by hand. Created now to avoid a second migration.
  status: churchStatusEnum('status').notNull().default('active'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  graceUntil: timestamp('grace_until', { withTimezone: true }),
```

- [ ] **Step 3: Add the owner_user table**

At the end of `src/db/schema.ts`:
```ts
/** Platform owner (Rafael). Deliberately has NO church_id — an owner belongs to
 *  no church. This is why owner auth is a separate table rather than a role flag
 *  on admin_user, whose church_id is NOT NULL. */
export const ownerUser = pgTable('owner_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUq: uniqueIndex('owner_user_email_uq').on(t.email),
}));
```

- [ ] **Step 4: Generate the migration**

Run: `npm run typecheck && npm run db:generate`
Expected: typecheck exits 0; a new `drizzle/0001_*.sql` appears containing `CREATE TYPE "public"."church_status"`, `ALTER TABLE "church" ADD COLUMN "status"`, and `CREATE TABLE "owner_user"`.

- [ ] **Step 5: Read the generated SQL**

Open the new `drizzle/0001_*.sql` and confirm it contains the enum, all four `ALTER TABLE "church" ADD COLUMN` statements, the `owner_user` table, and the `owner_user_email_uq` unique index. If any is missing, the schema edit is wrong — fix and regenerate rather than hand-editing the SQL.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add church lifecycle columns and owner_user table"
```

---

### Task 2: Pure church-status logic

**Files:**
- Create: `src/lib/church-status.ts`
- Test: `tests/church-status.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ChurchStatus`, `GRACE_PERIOD_MS`, `effectiveStatus(status, graceUntil, now)`

**Note:** this mirrors the existing `effectiveMode()` in `src/lib/contact-mode.ts` — a pure function taking `now` so callers and tests control time. It is a *different* clock from the bot's 24h windows; keep them separate.

- [ ] **Step 1: Write the failing test**

`tests/church-status.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { effectiveStatus, GRACE_PERIOD_MS } from '@/lib/church-status';

const now = new Date('2026-08-06T12:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

describe('GRACE_PERIOD_MS', () => {
  it('is 7 days', () => {
    expect(GRACE_PERIOD_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('effectiveStatus', () => {
  it('leaves an active church active', () => {
    expect(effectiveStatus('active', null, now)).toBe('active');
  });

  it('leaves a suspended church suspended', () => {
    expect(effectiveStatus('suspended', null, now)).toBe('suspended');
  });

  it('keeps a past_due church running while inside the grace period', () => {
    expect(effectiveStatus('past_due', inDays(3), now)).toBe('past_due');
  });

  it('suspends a past_due church once the grace deadline passes', () => {
    expect(effectiveStatus('past_due', inDays(-1), now)).toBe('suspended');
  });

  it('suspends exactly at the deadline', () => {
    expect(effectiveStatus('past_due', now, now)).toBe('suspended');
  });

  it('never silences a church when grace_until is missing', () => {
    // Missing data must not take a church off the air — the bot keeps running.
    expect(effectiveStatus('past_due', null, now)).toBe('past_due');
  });

  it('ignores grace_until for non-past_due statuses', () => {
    expect(effectiveStatus('active', inDays(-30), now)).toBe('active');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/church-status.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/church-status"`

- [ ] **Step 3: Implement**

`src/lib/church-status.ts`:
```ts
export type ChurchStatus = 'active' | 'past_due' | 'suspended';

/** A church whose payment failed keeps working for 7 days before the bot goes
 *  quiet, so members are never dropped into silence over an expired card. */
export const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** Pure. The status the app should actually act on, given the grace deadline.
 *  Computed on read rather than by a scheduled job — there is no cron to fail
 *  silently, and the same rule applies everywhere it is consulted.
 *
 *  A past_due church with no grace_until reads as past_due, NOT suspended:
 *  missing data must never take a church off the air. */
export function effectiveStatus(
  status: ChurchStatus,
  graceUntil: Date | null,
  now: Date,
): ChurchStatus {
  if (status !== 'past_due') return status;
  if (!graceUntil) return 'past_due';
  return now.getTime() >= graceUntil.getTime() ? 'suspended' : 'past_due';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/church-status.test.ts && npm run typecheck`
Expected: 7 PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/church-status.ts tests/church-status.test.ts
git commit -m "feat: add pure church-status grace-period logic"
```

---

### Task 3: Cross-tenant isolation suite in the test run

**Files:**
- Create: `tests/tenant-isolation.test.ts`
- Modify: `package.json` (add `@electric-sql/pglite` devDependency)

**Interfaces:**
- Consumes: the generated migrations in `drizzle/`
- Produces: a standing isolation suite (no exported code)

**Why this exists:** LGPD Art. 6 requires *demonstrating* that controls work. A passing suite is evidence; "we reviewed the queries" is not. It runs in `npm test` — there is no CI workflow in this repo, so the normal test run is the gate.

**It applies every migration in `drizzle/` in filename order**, so it keeps working as migrations are added. PGlite is a real Postgres compiled to WASM — no database server needed.

- [ ] **Step 1: Install PGlite as a test-only dependency**

Run: `npm install -D @electric-sql/pglite`
Expected: installs cleanly; it appears under `devDependencies`.

- [ ] **Step 2: Write the isolation suite**

`tests/tenant-isolation.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

let db: PGlite;
let A: Fixture;
let B: Fixture;

interface Fixture {
  churchId: string;
  contactId: string;
  menuItemId: string;
  prayerId: string;
  adminId: string;
}

async function makeChurch(name: string, phone: string, phoneNumberId: string): Promise<Fixture> {
  const c = await db.query<{ id: string }>(
    `insert into church (name,phone_number_id,access_token,app_secret,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,$2,'tok','sec','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [name, phoneNumberId],
  );
  const churchId = c.rows[0].id;
  const ct = await db.query<{ id: string }>(
    `insert into contact (church_id,phone,name,mode,last_inbound_at) values ($1,$2,$3,'human',now()) returning id`,
    [churchId, phone, `Membro de ${name}`],
  );
  const contactId = ct.rows[0].id;
  await db.query(
    `insert into message (church_id,contact_id,wa_message_id,direction,body) values ($1,$2,$3,'inbound',$4)`,
    [churchId, contactId, `wamid.${name}`, `segredo de ${name}`],
  );
  const mi = await db.query<{ id: string }>(
    `insert into menu_item (church_id,position,label,body_text,is_active,kind) values ($1,1,$2,'corpo',true,'content') returning id`,
    [churchId, `Menu ${name}`],
  );
  const pr = await db.query<{ id: string }>(
    `insert into prayer_request (church_id,contact_id,text) values ($1,$2,$3) returning id`,
    [churchId, contactId, `oração privada de ${name}`],
  );
  const ad = await db.query<{ id: string }>(
    `insert into admin_user (church_id,email,password_hash,name) values ($1,$2,'h',$3) returning id`,
    [churchId, `admin@${name}.org`, `Admin ${name}`],
  );
  return { churchId, contactId, menuItemId: mi.rows[0].id, prayerId: pr.rows[0].id, adminId: ad.rows[0].id };
}

beforeAll(async () => {
  db = new PGlite();
  // Apply every migration in order, so this suite keeps working as they accrue.
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await db.exec(stmt);
    }
  }
  A = await makeChurch('IgrejaA', '5511111', 'PNID_A');
  B = await makeChurch('IgrejaB', '5522222', 'PNID_B');
});

describe('tenant isolation — reads', () => {
  it('listConversations returns only the caller church', async () => {
    const r = await db.query<{ church_id: string }>(
      `select * from contact where church_id=$1 order by last_inbound_at desc nulls last`, [A.churchId]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows.every((x) => x.church_id === A.churchId)).toBe(true);
  });

  it('loadConversation with another church\'s contactId returns nothing', async () => {
    const r = await db.query(`select * from contact where id=$1 and church_id=$2 limit 1`, [B.contactId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('one church cannot read another\'s messages', async () => {
    const r = await db.query(`select * from message where contact_id=$1 and church_id=$2`, [B.contactId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('prayer, menu and staff lists exclude the other church', async () => {
    const p = await db.query<{ text: string }>(
      `select p.text from prayer_request p join contact c on p.contact_id=c.id where p.church_id=$1`, [A.churchId]);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].text).not.toContain('IgrejaB');

    const m = await db.query(`select * from menu_item where church_id=$1`, [A.churchId]);
    expect(m.rows).toHaveLength(1);

    const s = await db.query<{ email: string }>(`select * from admin_user where church_id=$1`, [A.churchId]);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].email).toContain('IgrejaA');
  });
});

describe('tenant isolation — writes change zero rows', () => {
  it('cannot edit another church\'s menu item', async () => {
    const r = await db.query(`update menu_item set label='HACKED' where id=$1 and church_id=$2 returning id`,
      [B.menuItemId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('cannot flip another church\'s contact mode', async () => {
    const r = await db.query(`update contact set mode='bot' where id=$1 and church_id=$2 returning id`,
      [B.contactId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('cannot mark another church\'s prayer request', async () => {
    const r = await db.query(`update prayer_request set status='orado' where id=$1 and church_id=$2 returning id`,
      [B.prayerId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('cannot delete another church\'s admin', async () => {
    const r = await db.query(`delete from admin_user where id=$1 and church_id=$2 returning id`,
      [B.adminId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('editing own church touches exactly one row and leaves the other untouched', async () => {
    const own = await db.query(`update church set greeting_text='editado por A' where id=$1 returning id`, [A.churchId]);
    expect(own.rows).toHaveLength(1);
    const other = await db.query<{ greeting_text: string }>(`select greeting_text from church where id=$1`, [B.churchId]);
    expect(other.rows[0].greeting_text).toBe('oi');
  });

  it('leaves the other church\'s data fully intact', async () => {
    const r = await db.query<{ c: number; m: number; a: number; p: number }>(
      `select (select count(*) from contact where church_id=$1)::int c,
              (select count(*) from menu_item where church_id=$1 and label like 'Menu%')::int m,
              (select count(*) from admin_user where church_id=$1)::int a,
              (select count(*) from prayer_request where church_id=$1 and status='novo')::int p`,
      [B.churchId]);
    expect(r.rows[0]).toEqual({ c: 1, m: 1, a: 1, p: 1 });
  });
});

describe('webhook tenant routing', () => {
  it('each phone_number_id resolves to its own church', async () => {
    const a = await db.query<{ name: string }>(`select name from church where phone_number_id=$1 limit 1`, ['PNID_A']);
    const b = await db.query<{ name: string }>(`select name from church where phone_number_id=$1 limit 1`, ['PNID_B']);
    expect(a.rows[0].name).toBe('IgrejaA');
    expect(b.rows[0].name).toBe('IgrejaB');
  });
});

describe('LGPD Art. 18 — deleting one church', () => {
  it('cascades all of that church and leaves the other whole', async () => {
    await db.query(`delete from church where id=$1`, [A.churchId]);
    const r = await db.query<{ c: number; m: number; p: number; a: number; ch: number }>(
      `select (select count(*) from contact)::int c,(select count(*) from message)::int m,
              (select count(*) from prayer_request)::int p,(select count(*) from admin_user)::int a,
              (select count(*) from church)::int ch`);
    expect(r.rows[0]).toEqual({ c: 1, m: 1, p: 1, a: 1, ch: 1 });
  });
});
```

- [ ] **Step 3: Run the suite**

Run: `npm test -- tests/tenant-isolation.test.ts`
Expected: all PASS. (This is the only test that runs SQL; it needs no database server.)

- [ ] **Step 4: Enforce the privilege boundary with a test, not a comment**

`src/lib/repo/platform.ts` (Task 5) holds queries that span churches — `getChurchForOwner(anyId)` returns a full church row including `accessToken` and `appSecret`. This repo has **no ESLint**, so nothing would stop church-facing code importing it and leaking another tenant's secrets. Make the boundary executable.

`tests/privilege-boundary.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Church-facing code must never import the owner-only cross-church repo.
 *  This is the only thing enforcing that boundary — the repo has no linter. */
const CHURCH_FACING_ROOTS = [
  join(process.cwd(), 'src/app/admin'),
  join(process.cwd(), 'src/app/api'),
  join(process.cwd(), 'src/lib/repo'),
];

const ALLOWED = new Set([join(process.cwd(), 'src/lib/repo/platform.ts')]);

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.tsx?$/.test(full) && !ALLOWED.has(full)) out.push(full);
  }
  return out;
}

describe('privilege boundary', () => {
  it('no church-facing file imports the owner-only platform repo', () => {
    const files = CHURCH_FACING_ROOTS.flatMap((d) => walk(d));
    // Guard against a bad glob silently passing by scanning nothing.
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((f) => /from ['"][^'"]*repo\/platform['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: every pre-existing test still passes alongside the new ones; typecheck exits 0. The privilege-boundary test passes trivially today (`platform.ts` does not exist yet) and becomes meaningful from Task 5 onward — that is intentional: it is in place *before* the file it guards.

- [ ] **Step 6: Commit**

```bash
git add tests/tenant-isolation.test.ts tests/privilege-boundary.test.ts package.json package-lock.json
git commit -m "test: add cross-tenant isolation suite and privilege-boundary guard"
```

---

### Task 4: Shared defaults + provisionChurch

**Files:**
- Create: `src/lib/church-defaults.ts`, `src/lib/provisioning.ts`
- Modify: `src/db/seed.ts`

**Interfaces:**
- Consumes: `db`; `church`, `menuItem`, `adminUser` schema; `hashPassword` from `@/lib/auth/password`
- Produces: `CHURCH_DEFAULTS`, `PRIVACY_ITEM`, `provisionChurch(name, adminEmail, password)`

**No live DB.** Gate: `npm run typecheck` + existing tests stay green. These queries never execute here.

**Design note:** `provisionChurch` is the single path that creates a church — signup will call it in the Stripe plan. It creates the church row, its first admin, and exactly one menu item (Privacidade). New churches otherwise start blank; the 9-item demo menu stays in `seed.ts` as a local dev fixture only.

- [ ] **Step 1: Create the shared defaults**

`src/lib/church-defaults.ts`:
```ts
/** The pt-BR strings a newly provisioned church starts with. Every one of these
 *  is an editable row, not a constant — the panel writes them. */
export const CHURCH_DEFAULTS = {
  name: 'Minha Igreja',
  greetingText: 'Olá! 🙏 Sou a secretária virtual da igreja. Como posso te ajudar?',
  menuHeaderText: 'Escolha uma opção:',
  menuButtonLabel: 'Ver opções',
  fallbackText: 'Desculpe, não entendi. 🙏 Escolha uma das opções abaixo:',
  unsupportedMediaText: 'Por enquanto eu entendo apenas texto e as opções do menu. 🙏',
  errorText: 'Estamos com uma instabilidade no momento. Por favor, tente novamente em instantes 🙏',
  prayerPromptText: 'Pode escrever seu pedido de oração 🙏 Vamos orar por você!',
  prayerThanksText: 'Recebemos seu pedido! ❤️ Nossa equipe estará orando por você.',
  handoffText: 'Um momento! 😊 Alguém da secretaria vai te atender por aqui em breve.',
  handoffClosedText: 'Atendimento encerrado. Se precisar de mais alguma coisa, é só chamar! 🙏',
};

/** The one menu item every church starts with. LGPD Art. 9 gives members the
 *  right to clear information about how their data is used, so transparency is a
 *  compliance mechanism rather than optional content.
 *
 *  It states data is handled IN ACCORDANCE WITH the LGPD — a statement about
 *  practice. It deliberately does not claim "this app is compliant", which is a
 *  legal representation software cannot guarantee.
 *
 *  It also does not promise an automated deletion command: that flow is the
 *  later LGPD plan. Until it exists, members are directed to the church. */
export const PRIVACY_ITEM = {
  position: 1,
  label: '🔒 Privacidade',
  kind: 'content' as const,
  bodyText: [
    '*Privacidade e seus dados*',
    '',
    'Seus dados são tratados de acordo com a LGPD (Lei nº 13.709/2018).',
    '',
    '*O que guardamos:* seu número de WhatsApp, as mensagens desta conversa e, se você enviar, seu pedido de oração.',
    '',
    '*Por quê:* para responder às suas dúvidas e atender aos seus pedidos.',
    '',
    '*Por quanto tempo:* as conversas são apagadas após 12 meses.',
    '',
    '*Seus direitos:* você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento. Para isso, entre em contato com a secretaria da igreja.',
    '',
    '_Edite este texto no painel._',
  ].join('\n'),
};
```

- [ ] **Step 2: Create provisionChurch**

`src/lib/provisioning.ts`:
```ts
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { adminUser, church, menuItem } from '@/db/schema';
import { findAdminByEmail } from '@/lib/repo/admin';
import { hashPassword } from '@/lib/auth/password';
import { CHURCH_DEFAULTS, PRIVACY_ITEM } from '@/lib/church-defaults';

/** The single path that brings a church into existence. Signup calls this.
 *
 *  The neon-http driver has no transactions, so the three inserts cannot be
 *  atomic. Order matters: the church row first (everything references it), then
 *  the admin (without which nobody can log in), then the menu item (cosmetic —
 *  a church with no Privacidade item still works and can add one). */
export async function provisionChurch(
  name: string,
  adminEmail: string,
  password: string,
): Promise<{ churchId: string; adminUserId: string }> {
  // admin_user.email is GLOBALLY unique — it has to be, because login resolves
  // the tenant from the email alone. So one address can own exactly one church
  // platform-wide. Check first: without this, a reused address (secretaria@…,
  // or simply a retry) commits the church row and then throws on the admin
  // insert, stranding an orphan church with no admin and no way to log in.
  if (await findAdminByEmail(adminEmail)) {
    throw new Error(`provisionChurch: an admin with the email ${adminEmail} already exists`);
  }

  const [created] = await db
    .insert(church)
    .values({ ...CHURCH_DEFAULTS, name, status: 'active' })
    .returning();

  if (!created) {
    throw new Error('provisionChurch: church insert returned no row');
  }

  try {
    const passwordHash = await hashPassword(password);
    const [admin] = await db
      .insert(adminUser)
      .values({ churchId: created.id, email: adminEmail, passwordHash, name: null })
      .returning();

    if (!admin) {
      throw new Error(`provisionChurch: admin insert returned no row for church ${created.id}`);
    }

    await db.insert(menuItem).values({
      churchId: created.id,
      position: PRIVACY_ITEM.position,
      label: PRIVACY_ITEM.label,
      bodyText: PRIVACY_ITEM.bodyText,
      imageUrl: null,
      isActive: true,
      kind: PRIVACY_ITEM.kind,
    });

    return { churchId: created.id, adminUserId: admin.id };
  } catch (error) {
    // No transaction to roll back, so compensate by hand — a church nobody can
    // log into is invisible in every UI and would accumulate on every retry.
    await db.delete(church).where(eq(church.id, created.id)).catch(() => {});
    throw error;
  }
}
```

- [ ] **Step 3: Point seed.ts at the shared defaults**

In `src/db/seed.ts`, delete its local `CHURCH_DEFAULTS` constant and import the shared one instead:
```ts
import { CHURCH_DEFAULTS } from '@/lib/church-defaults';
```
Leave the rest of `seed.ts` unchanged — its 9-item `MENU_SEED` stays as the local dev fixture, and its self-healing church/menu checks still apply. Note in a comment above `MENU_SEED`:
```ts
// Local dev fixture only. Real churches are created by provisionChurch(), which
// starts them blank apart from the Privacidade item.
```

- [ ] **Step 4: Test that two provisioned churches are independent**

The spec's Testing section requires this explicitly. It runs the **real** `provisionChurch` against PGlite by substituting the database client, so the email pre-check and the compensating delete are genuinely exercised — not re-implemented in the test.

`tests/provisioning.test.ts`:
```ts
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
```

- [ ] **Step 5: Run the new test, typecheck, and the full suite**

Run: `npm test -- tests/provisioning.test.ts && npm run typecheck && npm test`
Expected: both provisioning tests pass; typecheck exits 0; every other test still passes.

If `drizzle-orm/pglite` cannot be resolved, the installed `drizzle-orm` predates the PGlite driver — report that rather than rewriting the test to re-implement `provisionChurch`'s logic in raw SQL, which would prove nothing about the real function.

- [ ] **Step 6: Commit**

```bash
git add src/lib/church-defaults.ts src/lib/provisioning.ts src/db/seed.ts tests/provisioning.test.ts
git commit -m "feat: add provisionChurch and shared church defaults"
```

---

### Task 5: Owner repository, platform repository, owner session

**Files:**
- Create: `src/lib/repo/owner.ts`, `src/lib/repo/platform.ts`, `src/lib/auth/owner-session.ts`
- Modify: `src/lib/repo/church-admin.ts` (remove `getChurchRecord`)
- Modify: `scripts/create-admin.ts` (multi-church-safe)

**Interfaces:**
- Consumes: `db`; `church`, `contact`, `menuItem`, `ownerUser` schema; `ChurchStatus` from `@/lib/church-status`
- Produces: the `owner.ts`, `platform.ts` and `owner-session.ts` functions in the Interfaces Reference

**No live DB.** Gate: `npm run typecheck` + tests green.

**Privilege boundary:** `platform.ts` queries span churches on purpose. Keeping them out of `church-admin.ts` means a church-facing file can never accidentally import a cross-church query.

- [ ] **Step 1: Create the owner repository**

`src/lib/repo/owner.ts`:
```ts
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { ownerUser } from '@/db/schema';

export type OwnerRecord = typeof ownerUser.$inferSelect;

export async function findOwnerByEmail(email: string): Promise<OwnerRecord | undefined> {
  const rows = await db.select().from(ownerUser).where(eq(ownerUser.email, email)).limit(1);
  return rows[0];
}

/** Used by the guard on every request: a session cookie proves who you were, not
 *  that the account still exists. A revoked owner must lose access immediately,
 *  not whenever their cookie happens to expire. */
export async function findOwnerById(id: string): Promise<OwnerRecord | undefined> {
  const rows = await db.select().from(ownerUser).where(eq(ownerUser.id, id)).limit(1);
  return rows[0];
}

export async function createOwner(o: {
  email: string;
  passwordHash: string;
  name: string | null;
}): Promise<OwnerRecord> {
  const [created] = await db.insert(ownerUser).values(o).returning();
  if (!created) throw new Error('createOwner: insert returned no row');
  return created;
}
```

- [ ] **Step 2: Create the platform repository**

`src/lib/repo/platform.ts`:
```ts
import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { church, contact, menuItem } from '@/db/schema';
import type { ChurchStatus } from '@/lib/church-status';

/** OWNER-ONLY. Every query here spans churches by design — that is the whole
 *  point of the owner console. Church-facing code must never import this file;
 *  it uses the church-scoped repos instead. */

export interface ChurchSummary {
  id: string;
  name: string;
  status: ChurchStatus;
  graceUntil: Date | null;
  whatsappConnected: boolean;
  activeMenuItems: number;
  lastInboundAt: Date | null;
  createdAt: Date;
}

export async function listChurches(): Promise<ChurchSummary[]> {
  const rows = await db.select().from(church).orderBy(church.createdAt);

  const summaries: ChurchSummary[] = [];
  for (const row of rows) {
    const items = await db
      .select({ n: count() })
      .from(menuItem)
      .where(and(eq(menuItem.churchId, row.id), eq(menuItem.isActive, true)));

    const last = await db
      .select({ at: sql<Date | null>`max(${contact.lastInboundAt})` })
      .from(contact)
      .where(eq(contact.churchId, row.id));

    summaries.push({
      id: row.id,
      name: row.name,
      status: row.status,
      graceUntil: row.graceUntil,
      whatsappConnected: !!row.phoneNumberId && !!row.accessToken,
      activeMenuItems: items[0]?.n ?? 0,
      lastInboundAt: last[0]?.at ?? null,
      createdAt: row.createdAt,
    });
  }
  return summaries;
}

export async function getChurchForOwner(churchId: string) {
  const rows = await db.select().from(church).where(eq(church.id, churchId)).limit(1);
  return rows[0];
}

/** Two different rules on purpose.
 *
 *  The secrets (accessToken, appSecret) never round-trip to the browser, so their
 *  field is blank on every render — blank therefore means "keep", not "clear".
 *
 *  phoneNumberId and webhookVerifyToken DO round-trip and are always written,
 *  with empty mapped to null. That matters: phone_number_id is globally unique,
 *  so moving a number between churches requires clearing it on the old one
 *  first. A blanket keep-on-blank rule would make that impossible and would also
 *  remove the ability to disconnect a church by clearing its credentials. */
export async function setChurchCredentials(
  churchId: string,
  fields: { phoneNumberId?: string; accessToken?: string; appSecret?: string; webhookVerifyToken?: string },
): Promise<void> {
  const update: Record<string, string | null> = {
    phoneNumberId: fields.phoneNumberId?.trim() || null,
    webhookVerifyToken: fields.webhookVerifyToken?.trim() || null,
  };
  if (fields.accessToken) update.accessToken = fields.accessToken;
  if (fields.appSecret) update.appSecret = fields.appSecret;
  await db.update(church).set(update).where(eq(church.id, churchId));
}

export async function setChurchStatus(churchId: string, status: ChurchStatus): Promise<void> {
  // Clearing grace_until on any manual status change keeps the computed
  // effectiveStatus honest — a manually reactivated church is not still counting
  // down an old grace deadline.
  await db.update(church).set({ status, graceUntil: null }).where(eq(church.id, churchId));
}

/** Returns the church only when there is exactly one. Used by local scripts that
 *  used to assume a single church; ambiguous once a second church exists. */
export async function getOnlyChurch() {
  const rows = await db.select().from(church).limit(2);
  return rows.length === 1 ? rows[0] : undefined;
}
```

- [ ] **Step 3: Remove the single-church assumption**

In `src/lib/repo/church-admin.ts`, delete the `getChurchRecord` function entirely (its "the single church" premise is now false). Leave `getChurchById` and `updateChurch` untouched.

- [ ] **Step 4: Make create-admin multi-church-safe**

In `scripts/create-admin.ts`, replace the `getChurchRecord` import:
```ts
import { getChurchForOwner, getOnlyChurch, listChurches } from '../src/lib/repo/platform';
```
Parse an optional `--church <id>` out of the arguments — currently the script reads `const [email, password, name] = process.argv.slice(2);`, so replace that line with:
```ts
  const argv = process.argv.slice(2);
  const churchFlag = argv.indexOf('--church');
  const explicitChurchId = churchFlag === -1 ? undefined : argv[churchFlag + 1];
  const [email, password, name] = churchFlag === -1 ? argv : argv.filter((_, i) => i !== churchFlag && i !== churchFlag + 1);
```
and replace the church lookup block with:
```ts
  const churchRow = explicitChurchId
    ? await getChurchForOwner(explicitChurchId)
    : await getOnlyChurch();

  if (!churchRow) {
    const all = await listChurches();
    if (all.length === 0) {
      console.error('No church found. Create one first: npm run create-church -- <name> <adminEmail> <password>');
    } else if (explicitChurchId) {
      console.error(`No church with id ${explicitChurchId}.`);
    } else {
      console.error('More than one church exists — pass --church <id>:');
      for (const c of all) console.error(`  ${c.id}  ${c.name}`);
    }
    process.exitCode = 1;
    return;
  }
```
Also update the usage line in the same file to `'Usage: npm run create-admin -- <email> <password> [name] [--church <churchId>]'`.

This keeps the single-church local workflow working unchanged while staying correct once a second church exists — and, unlike refusing outright, it names a path that actually exists.

- [ ] **Step 5: Create the owner session**

`src/lib/auth/owner-session.ts`:
```ts
import { getIronSession, type IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export interface OwnerSessionData {
  kind?: 'owner';
  ownerUserId?: string;
  name?: string;
}

/** A distinct cookie from the church panel's `sv_admin`.
 *
 *  The `kind` discriminator is load-bearing, not decoration: both sessions are
 *  sealed with the same SESSION_SECRET, and iron-session does not bind a seal to
 *  a cookie name — so a valid `sv_admin` value pasted into an `sv_owner` cookie
 *  unseals successfully. Without `kind`, the only thing rejecting it would be
 *  the church payload happening not to have an `ownerUserId` field, which one
 *  future rename would silently undo. */
const COOKIE_NAME = 'sv_owner';

export function isOwnerAuthenticated(session: Pick<OwnerSessionData, 'kind' | 'ownerUserId'>): boolean {
  return session.kind === 'owner' && typeof session.ownerUserId === 'string' && session.ownerUserId.length > 0;
}

/** Read SESSION_SECRET lazily so `next build` never requires it. */
function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters.');
  }
  return secret;
}

export async function getOwnerSession(): Promise<IronSession<OwnerSessionData>> {
  return getIronSession<OwnerSessionData>(await cookies(), {
    password: sessionPassword(),
    cookieName: COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  });
}

export async function requireOwnerSession(): Promise<{ ownerUserId: string; name: string }> {
  const session = await getOwnerSession();
  if (!isOwnerAuthenticated(session)) {
    redirect('/owner/login');
  }
  // The cookie proves who they were. Confirm the account still exists, so a
  // revoked owner loses access to every church's credentials immediately.
  const owner = await findOwnerById(session.ownerUserId!);
  if (!owner) {
    session.destroy();
    redirect('/owner/login');
  }
  return { ownerUserId: owner.id, name: owner.name ?? '' };
}
```

Add the import at the top of the same file:
```ts
import { findOwnerById } from '@/lib/repo/owner';
```

- [ ] **Step 6: Add the matching pieces on the church-auth side**

Three small edits so the two session types are explicitly distinguishable and identities are verifiable.

In `src/lib/repo/admin.ts`, add beside `findAdminByEmail`:
```ts
/** Used by the write guard: confirms the admin row still exists, so a removed
 *  staff member loses access immediately rather than when their cookie expires. */
export async function findAdminById(id: string): Promise<AdminRecord | undefined> {
  const rows = await db.select().from(adminUser).where(eq(adminUser.id, id)).limit(1);
  return rows[0];
}
```

In `src/lib/auth/session.ts`, add the discriminator to the interface and require it in the guard:
```ts
export interface SessionData {
  kind?: 'admin';
  adminUserId?: string;
  churchId?: string;
  name?: string;
}

export function isAuthenticated(session: Pick<SessionData, 'kind' | 'adminUserId'>): boolean {
  return session.kind === 'admin' && typeof session.adminUserId === 'string' && session.adminUserId.length > 0;
}
```

In `src/app/admin/login/actions.ts`, set it when the session is created — immediately before `session.adminUserId = admin.id;` add:
```ts
  session.kind = 'admin';
```

**Note:** this invalidates any existing `sv_admin` cookie (it has no `kind`), so anyone logged in must log in again. With no production deployment yet, that costs nothing.

- [ ] **Step 7: Test that the two session types cannot be confused**

`tests/session-kind.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAuthenticated } from '@/lib/auth/session';
import { isOwnerAuthenticated } from '@/lib/auth/owner-session';

describe('session kind isolation', () => {
  it('accepts a well-formed session of its own kind', () => {
    expect(isAuthenticated({ kind: 'admin', adminUserId: 'a1' })).toBe(true);
    expect(isOwnerAuthenticated({ kind: 'owner', ownerUserId: 'o1' })).toBe(true);
  });

  it('rejects a church admin payload at the owner guard', () => {
    // Both cookies are sealed with the same SESSION_SECRET, so an sv_admin value
    // pasted into sv_owner unseals. `kind` is what actually rejects it.
    expect(isOwnerAuthenticated({ kind: 'admin', ownerUserId: 'a1' } as never)).toBe(false);
    expect(isOwnerAuthenticated({ ownerUserId: 'a1' } as never)).toBe(false);
  });

  it('rejects an owner payload at the church guard', () => {
    expect(isAuthenticated({ kind: 'owner', adminUserId: 'o1' } as never)).toBe(false);
  });

  it('rejects empty and missing ids', () => {
    expect(isAuthenticated({ kind: 'admin', adminUserId: '' })).toBe(false);
    expect(isOwnerAuthenticated({ kind: 'owner', ownerUserId: '' })).toBe(false);
    expect(isAuthenticated({})).toBe(false);
    expect(isOwnerAuthenticated({})).toBe(false);
  });
});
```

- [ ] **Step 8: Typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0 (proving no caller still references `getChurchRecord`); the new session-kind tests pass; all other tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/repo/owner.ts src/lib/repo/platform.ts src/lib/auth/owner-session.ts src/lib/auth/session.ts src/lib/repo/admin.ts src/lib/repo/church-admin.ts src/app/admin/login/actions.ts scripts/create-admin.ts tests/session-kind.test.ts
git commit -m "feat: add owner/platform repos, discriminated sessions, multi-church-safe scripts"
```

---

### Task 6: Owner login, guard, and bootstrap script

**Files:**
- Create: `src/app/owner/login/page.tsx`, `src/app/owner/login/actions.ts`, `src/app/owner/login/OwnerLoginForm.tsx`
- Create: `src/app/owner/(protected)/layout.tsx`, `src/app/owner/(protected)/actions.ts`
- Create: `scripts/create-owner.ts`
- Modify: `package.json` (add `create-owner` script)

**Interfaces:**
- Consumes: `findOwnerByEmail`, `createOwner` from `@/lib/repo/owner`; `hashPassword`, `verifyPassword`; `getOwnerSession`, `isOwnerAuthenticated`, `requireOwnerSession`
- Produces: a working `/owner/login` and a guarded `(protected)` group

**No live DB.** Gate: `npm run typecheck && npm run build` (must list `/owner/login`). The login never executes here.

**Route-group note:** `login/` sits OUTSIDE `(protected)/`, so the guard never runs for the login page — no redirect loop. Do NOT create `src/app/owner/layout.tsx`.

- [ ] **Step 1: Owner login action**

`src/app/owner/login/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { findOwnerByEmail } from '@/lib/repo/owner';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getOwnerSession } from '@/lib/auth/owner-session';

export interface OwnerLoginState {
  error?: string;
}

// Fixed-cost decoy so an unknown email still incurs a real bcrypt compare —
// response time must not reveal whether an owner account exists.
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('timing-decoy-value');
  return decoyHash;
}

export async function ownerLogin(_prev: OwnerLoginState, formData: FormData): Promise<OwnerLoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Informe e-mail e senha.' };
  }

  const owner = await findOwnerByEmail(email);
  const ok = await verifyPassword(password, owner?.passwordHash ?? (await getDecoyHash()));

  if (!owner || !ok) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  const session = await getOwnerSession();
  session.kind = 'owner';
  session.ownerUserId = owner.id;
  session.name = owner.name ?? '';
  await session.save();

  redirect('/owner');
}
```

- [ ] **Step 2: Owner login form**

`src/app/owner/login/OwnerLoginForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { ownerLogin, type OwnerLoginState } from './actions';

const initial: OwnerLoginState = {};

export function OwnerLoginForm() {
  const [state, formAction, pending] = useActionState(ownerLogin, initial);

  return (
    <form action={formAction} className="card" style={{ maxWidth: 360, margin: '80px auto' }}>
      <h1 style={{ marginTop: 0 }}>Painel do proprietário</h1>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Senha</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12, width: '100%' }}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Owner login page**

`src/app/owner/login/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { getOwnerSession, isOwnerAuthenticated } from '@/lib/auth/owner-session';
import { OwnerLoginForm } from './OwnerLoginForm';

export default async function OwnerLoginPage() {
  const session = await getOwnerSession();
  if (isOwnerAuthenticated(session)) {
    redirect('/owner');
  }
  return <OwnerLoginForm />;
}
```

- [ ] **Step 4: Owner logout action**

`src/app/owner/(protected)/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { getOwnerSession } from '@/lib/auth/owner-session';

export async function ownerLogout(): Promise<void> {
  const session = await getOwnerSession();
  session.destroy();
  redirect('/owner/login');
}
```

- [ ] **Step 5: Guarded owner layout**

`src/app/owner/(protected)/layout.tsx`:
```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOwnerSession, isOwnerAuthenticated } from '@/lib/auth/owner-session';
import { ownerLogout } from './actions';

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await getOwnerSession();
  if (!isOwnerAuthenticated(session)) {
    redirect('/owner/login');
  }

  return (
    <div>
      <nav className="nav">
        <span className="brand">🛠️ Secretária Virtual — Proprietário</span>
        <Link href="/owner">Igrejas</Link>
        <span className="grow" />
        <span className="hint">{session.name}</span>
        <form action={ownerLogout}>
          <button type="submit">Sair</button>
        </form>
      </nav>
      <div className="container">{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Bootstrap script**

`scripts/create-owner.ts`:
```ts
import 'dotenv/config';
import { createOwner, findOwnerByEmail } from '../src/lib/repo/owner';
import { hashPassword } from '../src/lib/auth/password';

async function main() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npm run create-owner -- <email> <password> [name]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }
  if (await findOwnerByEmail(email)) {
    console.error(`An owner with email ${email} already exists.`);
    process.exitCode = 1;
    return;
  }

  await createOwner({ email, passwordHash: await hashPassword(password), name: name ?? null });
  console.log(`Owner created: ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Add a CLI path to create a church**

Without this, `provisionChurch()` has no caller and there is no way to bring church #2 into existence — `db:seed` only ever creates the first one. The owner console gets a form in Task 7; this is the headless equivalent, and the one the error message in `create-admin` now points at.

`scripts/create-church.ts`:
```ts
import 'dotenv/config';
import { provisionChurch } from '../src/lib/provisioning';

async function main() {
  const [name, adminEmail, password] = process.argv.slice(2);

  if (!name || !adminEmail || !password) {
    console.error('Usage: npm run create-church -- <name> <adminEmail> <password>');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const { churchId, adminUserId } = await provisionChurch(name, adminEmail, password);
  console.log(`Church created: ${name}`);
  console.log(`  church id: ${churchId}`);
  console.log(`  admin:     ${adminEmail} (${adminUserId})`);
  console.log('Connect its WhatsApp number from the owner console at /owner.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 8: Add the npm scripts**

In `package.json` `scripts`, beside `create-admin`:
```json
    "create-owner": "tsx scripts/create-owner.ts",
    "create-church": "tsx scripts/create-church.ts",
```

- [ ] **Step 9: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck exits 0; build lists `/owner/login`; no route-collision or layout error.

- [ ] **Step 10: Commit**

```bash
git add src/app/owner scripts/create-owner.ts scripts/create-church.ts package.json
git commit -m "feat: add owner login, guarded owner layout, and bootstrap scripts"
```

---

### Task 7: Owner console — church list

**Files:**
- Create: `src/app/owner/(protected)/page.tsx`
- Modify: `src/app/globals.css` (add status-pill styles)

**Interfaces:**
- Consumes: `requireOwnerSession`; `listChurches` from `@/lib/repo/platform`; `effectiveStatus` from `@/lib/church-status`
- Produces: the `/owner` church list

**No live DB.** Gate: `npm run typecheck && npm run build` (must list `/owner`).

- [ ] **Step 1: Add status-pill styles**

Append to `src/app/globals.css`:
```css
.pill { font-size: 11px; padding: 2px 9px; border-radius: 999px; font-weight: 600; white-space: nowrap; }
.pill-active { background: #d1fae5; color: #065f46; }
.pill-past_due { background: #fef3c7; color: #92400e; }
.pill-suspended { background: #fee2e2; color: #991b1b; }
.warn { color: #92400e; font-size: 12px; }
```

- [ ] **Step 2: Add the createChurch action**

Append to `src/app/owner/(protected)/actions.ts` (which already holds `ownerLogout`):
```ts
import { revalidatePath } from 'next/cache';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { provisionChurch } from '@/lib/provisioning';

export interface NewChurchState {
  error?: string;
  created?: string;
}

/** The owner-console path that brings a church into existence. Without this (or
 *  `npm run create-church`) provisionChurch would have no caller and church #2
 *  could not exist — db:seed only ever creates the first one. */
export async function createChurch(_prev: NewChurchState, formData: FormData): Promise<NewChurchState> {
  await requireOwnerSession();

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!name || !email || !password) return { error: 'Preencha nome, e-mail e senha.' };
  if (password.length < 8) return { error: 'A senha precisa ter ao menos 8 caracteres.' };

  try {
    await provisionChurch(name, email, password);
  } catch (error) {
    console.error('createChurch failed', error);
    const message = error instanceof Error ? error.message : '';
    return {
      error: message.includes('already exists')
        ? 'Já existe uma conta com esse e-mail. Cada e-mail pertence a uma única igreja.'
        : 'Não foi possível criar a igreja. Tente novamente.',
    };
  }

  revalidatePath('/owner');
  return { created: name };
}
```

- [ ] **Step 3: Add the new-church form**

`src/app/owner/(protected)/NewChurchForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { createChurch, type NewChurchState } from './actions';

const initial: NewChurchState = {};

export function NewChurchForm() {
  const [state, formAction, pending] = useActionState(createChurch, initial);

  return (
    <details className="card">
      <summary><strong>+ Nova igreja</strong></summary>
      <form action={formAction} style={{ marginTop: 12 }}>
        <label htmlFor="nc-name">Nome da igreja</label>
        <input id="nc-name" name="name" type="text" required />

        <label htmlFor="nc-email">E-mail do administrador</label>
        <input id="nc-email" name="email" type="email" required />

        <label htmlFor="nc-password">Senha inicial (mín. 8 caracteres)</label>
        <input id="nc-password" name="password" type="password" autoComplete="new-password" required />

        <p className="hint">
          A igreja começa com o menu vazio, apenas com o item de Privacidade. Conecte o WhatsApp
          dela depois, na página da igreja.
        </p>

        {state.error && <p className="error">{state.error}</p>}
        {state.created && <p style={{ color: 'var(--ok)' }}>Igreja “{state.created}” criada! ✓</p>}

        <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
          {pending ? 'Criando…' : 'Criar igreja'}
        </button>
      </form>
    </details>
  );
}
```

- [ ] **Step 4: Create the church list page**

`src/app/owner/(protected)/page.tsx`:
```tsx
import Link from 'next/link';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { listChurches } from '@/lib/repo/platform';
import { effectiveStatus } from '@/lib/church-status';
import { NewChurchForm } from './NewChurchForm';

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  suspended: 'Suspensa',
};

export default async function OwnerChurchesPage() {
  await requireOwnerSession();
  const churches = await listChurches();
  const now = new Date();

  return (
    <div>
      <h1>Igrejas</h1>
      <p className="hint">{churches.length} igreja(s) cadastrada(s).</p>

      <NewChurchForm />

      {churches.length === 0 && <p className="hint">Nenhuma igreja ainda.</p>}

      {churches.map((c) => {
        const status = effectiveStatus(c.status, c.graceUntil, now);
        return (
          <Link key={c.id} className="card conv" href={`/owner/${c.id}`}>
            <span className="grow">
              <strong>{c.name}</strong>
              <span className="hint">
                {' '}· {c.whatsappConnected ? 'WhatsApp conectado' : 'WhatsApp não conectado'}
                {' '}· {c.activeMenuItems} item(ns) no menu
              </span>
              {c.activeMenuItems === 0 && (
                <div className="warn">⚠️ Sem itens ativos — o bot não tem o que oferecer.</div>
              )}
            </span>
            <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck exits 0; build lists `/owner`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/owner/(protected)" src/app/globals.css
git commit -m "feat: owner console church list and new-church form"
```

---

### Task 8: Owner console — church detail, credentials, suspend/reactivate

**Files:**
- Create: `src/app/owner/(protected)/[churchId]/page.tsx`, `src/app/owner/(protected)/[churchId]/actions.ts`, `src/app/owner/(protected)/[churchId]/CredentialsForm.tsx`, `src/app/owner/(protected)/[churchId]/StatusControls.tsx`

**Interfaces:**
- Consumes: `requireOwnerSession`; `getChurchForOwner`, `setChurchCredentials`, `setChurchStatus` from `@/lib/repo/platform`; `effectiveStatus`
- Produces: the `/owner/[churchId]` detail screen

**No live DB.** Gate: `npm run typecheck && npm run build` (must list `/owner/[churchId]`).

**`params` is a Promise in Next 15** — `await params`. Secrets are never sent to the browser: the page passes booleans for whether each secret is set.

- [ ] **Step 1: The actions**

`src/app/owner/(protected)/[churchId]/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { setChurchCredentials, setChurchStatus } from '@/lib/repo/platform';
import type { ChurchStatus } from '@/lib/church-status';

export interface OwnerActionResult {
  error?: string;
  ok?: boolean;
}

export async function saveCredentials(
  churchId: string,
  _prev: OwnerActionResult,
  formData: FormData,
): Promise<OwnerActionResult> {
  await requireOwnerSession();

  try {
    // Secrets are blank unless deliberately retyped, so blank means "keep".
    // phoneNumberId / webhookVerifyToken are always written (empty → null) so a
    // number can be released from one church and assigned to another.
    await setChurchCredentials(churchId, {
      phoneNumberId: String(formData.get('phoneNumberId') ?? '').trim(),
      webhookVerifyToken: String(formData.get('webhookVerifyToken') ?? '').trim(),
      accessToken: String(formData.get('accessToken') ?? '').trim() || undefined,
      appSecret: String(formData.get('appSecret') ?? '').trim() || undefined,
    });
  } catch (error) {
    console.error('saveCredentials failed', error);
    // phone_number_id is globally unique, and pasting one that already belongs to
    // another church is the likeliest mistake here — name it rather than showing
    // a generic failure.
    const message = String(error instanceof Error ? error.message : '');
    return {
      error: message.includes('church_phone_number_id_uq')
        ? 'Este Phone Number ID já está em uso por outra igreja. Libere-o na outra igreja primeiro.'
        : 'Não foi possível salvar as credenciais. Tente novamente.',
    };
  }

  revalidatePath(`/owner/${churchId}`);
  revalidatePath('/owner');
  return { ok: true };
}

export async function changeStatus(churchId: string, status: ChurchStatus): Promise<OwnerActionResult> {
  await requireOwnerSession();
  try {
    await setChurchStatus(churchId, status);
  } catch (error) {
    console.error('changeStatus failed', error);
    return { error: 'Não foi possível alterar a situação. Tente novamente.' };
  }
  revalidatePath(`/owner/${churchId}`);
  revalidatePath('/owner');
  return { ok: true };
}
```

- [ ] **Step 2: Credentials form**

`src/app/owner/(protected)/[churchId]/CredentialsForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { saveCredentials, type OwnerActionResult } from './actions';

const initial: OwnerActionResult = {};

export function CredentialsForm({
  churchId,
  values,
}: {
  churchId: string;
  values: { phoneNumberId: string; webhookVerifyToken: string; hasAccessToken: boolean; hasAppSecret: boolean };
}) {
  const action = saveCredentials.bind(null, churchId);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="card">
      <h2 style={{ marginTop: 0 }}>Conexão WhatsApp (Meta)</h2>
      <p className="hint">Você gerencia o número desta igreja. A igreja vê apenas se está conectado.</p>

      <label htmlFor="phoneNumberId">Phone Number ID</label>
      <input id="phoneNumberId" name="phoneNumberId" type="text" defaultValue={values.phoneNumberId} />

      <label htmlFor="webhookVerifyToken">Webhook Verify Token</label>
      <input id="webhookVerifyToken" name="webhookVerifyToken" type="text" defaultValue={values.webhookVerifyToken} />

      <label htmlFor="accessToken">
        Access Token {values.hasAccessToken && <span className="hint">(preenchido — deixe em branco para manter)</span>}
      </label>
      <input id="accessToken" name="accessToken" type="password" autoComplete="off" placeholder={values.hasAccessToken ? '••••••••' : ''} />

      <label htmlFor="appSecret">
        App Secret {values.hasAppSecret && <span className="hint">(preenchido — deixe em branco para manter)</span>}
      </label>
      <input id="appSecret" name="appSecret" type="password" autoComplete="off" placeholder={values.hasAppSecret ? '••••••••' : ''} />

      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p style={{ color: 'var(--ok)' }}>Salvo! ✓</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : 'Salvar credenciais'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Status controls**

`src/app/owner/(protected)/[churchId]/StatusControls.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { changeStatus } from './actions';
import type { ChurchStatus } from '@/lib/church-status';

export function StatusControls({ churchId, status }: { churchId: string; status: ChurchStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  function set(next: ChurchStatus, confirmText: string) {
    if (!confirm(confirmText)) return;
    setError('');
    start(async () => {
      const r = await changeStatus(churchId, next);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Situação</h2>
      <p className="hint">
        Suspender faz o bot parar de responder e deixa o painel da igreja somente leitura.
        As mensagens continuam sendo registradas — nada é apagado.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button
          disabled={pending || status === 'active'}
          onClick={() => set('active', 'Reativar esta igreja? O bot volta a responder.')}
        >
          Reativar
        </button>
        <button
          className="danger"
          disabled={pending || status === 'suspended'}
          onClick={() => set('suspended', 'Suspender esta igreja? O bot vai parar de responder aos membros.')}
        >
          Suspender
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: The detail page**

`src/app/owner/(protected)/[churchId]/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { getChurchForOwner } from '@/lib/repo/platform';
import { effectiveStatus } from '@/lib/church-status';
import { CredentialsForm } from './CredentialsForm';
import { StatusControls } from './StatusControls';

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  suspended: 'Suspensa',
};

export default async function OwnerChurchPage({ params }: { params: Promise<{ churchId: string }> }) {
  const { churchId } = await params;
  await requireOwnerSession();

  const church = await getChurchForOwner(churchId);
  if (!church) notFound();

  const status = effectiveStatus(church.status, church.graceUntil, new Date());

  return (
    <div>
      <p className="hint"><Link href="/owner">← Igrejas</Link></p>
      <div className="row">
        <h1 className="grow">{church.name}</h1>
        <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
      </div>

      <StatusControls churchId={churchId} status={status} />

      <CredentialsForm
        churchId={churchId}
        values={{
          phoneNumberId: church.phoneNumberId ?? '',
          webhookVerifyToken: church.webhookVerifyToken ?? '',
          hasAccessToken: !!church.accessToken,
          hasAppSecret: !!church.appSecret,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck exits 0; build lists `/owner/[churchId]`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/owner/(protected)/[churchId]"
git commit -m "feat: owner console church detail with credentials and suspend/reactivate"
```

---

### Task 9: Church panel — WhatsApp becomes read-only status

**Files:**
- Modify: `src/app/admin/(protected)/configuracoes/page.tsx`, `src/app/admin/(protected)/configuracoes/actions.ts`, `src/app/admin/(protected)/configuracoes/CredentialsForm.tsx`

**Interfaces:**
- Consumes: `requireSession`; `getChurchById`
- Produces: a read-only connection panel; `saveCredentials` removed from the church-facing actions

**No live DB.** Gate: `npm run typecheck && npm run build`.

**Why:** Rafael manages every number. A church that could edit these could break its own bot, and the values are his Meta app's secrets, not theirs.

- [ ] **Step 1: Replace the credentials form with a status display**

Replace the entire contents of `src/app/admin/(protected)/configuracoes/CredentialsForm.tsx` with:
```tsx
/** Read-only. The church does not manage its WhatsApp connection — Rafael does,
 *  from the owner console. Showing status (without secrets) keeps support
 *  conversations simple: "está conectado?" is answerable by the church. */
export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Conexão WhatsApp</h2>
      {connected ? (
        <p style={{ color: 'var(--ok)', margin: 0 }}>✓ Conectado</p>
      ) : (
        <p className="warn" style={{ margin: 0 }}>Aguardando conexão</p>
      )}
      <p className="hint" style={{ marginBottom: 0 }}>
        A conexão com o WhatsApp é configurada pela equipe da Secretária Virtual.
        Se algo não estiver funcionando, entre em contato com o suporte.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Remove the church-facing saveCredentials action**

In `src/app/admin/(protected)/configuracoes/actions.ts`, delete the entire `saveCredentials` function and any now-unused imports it alone used (`updateChurch` stays — `saveTexts` still needs it). Leave `saveTexts`, `addStaff` and `removeStaff` unchanged.

- [ ] **Step 3: Update the page**

In `src/app/admin/(protected)/configuracoes/page.tsx`, change the import and the usage:
```tsx
import { ConnectionStatus } from './CredentialsForm';
```
and replace the `<CredentialsForm values={{...}} />` element with:
```tsx
      <ConnectionStatus connected={!!church.phoneNumberId && !!church.accessToken} />
```

- [ ] **Step 4: Typecheck, build and tests**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck exits 0 (proving nothing still imports the removed action); build succeeds; tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(protected)/configuracoes"
git commit -m "feat: churches see read-only WhatsApp status instead of credentials"
```

---

### Task 10: Enforce suspension — silent bot, read-only panel

**Files:**
- Create: `src/lib/auth/writable.ts`
- Modify: `src/app/api/whatsapp/webhook/route.ts`
- Modify: `src/app/admin/(protected)/layout.tsx`
- Modify: `src/app/admin/(protected)/conteudo/actions.ts`, `.../conteudo/item-actions.ts`, `.../configuracoes/actions.ts`, `.../caixa/actions.ts`, `.../oracao/actions.ts`

**Interfaces:**
- Consumes: `requireSession`; `getChurchById`; `effectiveStatus`
- Produces: `requireWritableSession()`

**No live DB.** Gate: `npm run typecheck && npm run build && npm test`.

**Two enforcement points.** The webhook stops *sending* (but still records, so nothing is lost). The panel refuses *writes* (but still renders, so the church can see its content and understand why).

- [ ] **Step 1: Create the writable-session guard**

`src/lib/auth/writable.ts`:
```ts
import { requireSession } from '@/lib/auth/session';
import { findAdminById } from '@/lib/repo/admin';
import { getChurchById } from '@/lib/repo/church-admin';
import { effectiveStatus } from '@/lib/church-status';

/** Session, plus two checks the session cookie alone cannot make.
 *
 *  1. The admin still exists and still belongs to this church. A cookie proves
 *     who someone WAS; `removeStaff` can delete their row, and a removed
 *     secretary must not keep writing to the church's inbox until their cookie
 *     happens to expire.
 *  2. The church is not suspended.
 *
 *  Returns a sentinel rather than throwing, so each action surfaces a pt-BR
 *  message in its own result shape. */
export async function requireWritableSession(): Promise<
  { adminUserId: string; churchId: string; name: string } | { blocked: 'suspended' | 'revoked' }
> {
  const session = await requireSession();

  const admin = await findAdminById(session.adminUserId);
  if (!admin || admin.churchId !== session.churchId) return { blocked: 'revoked' };

  const church = await getChurchById(session.churchId);
  if (!church) return { blocked: 'revoked' };

  if (effectiveStatus(church.status, church.graceUntil, new Date()) === 'suspended') {
    return { blocked: 'suspended' };
  }

  return session;
}

/** The pt-BR messages shown wherever a write is refused. */
export const SUSPENDED_MESSAGE =
  'A assinatura desta igreja está suspensa. Entre em contato com o suporte para reativar o painel.';
export const REVOKED_MESSAGE =
  'Sua conta não tem mais acesso a este painel. Faça login novamente.';

/** Maps the sentinel to its message, so every call site stays one line. */
export function blockedMessage(blocked: 'suspended' | 'revoked'): string {
  return blocked === 'suspended' ? SUSPENDED_MESSAGE : REVOKED_MESSAGE;
}
```

- [ ] **Step 2: Stop the bot for suspended churches**

In `src/app/api/whatsapp/webhook/route.ts`, add the import:
```ts
import { effectiveStatus } from '@/lib/church-status';
```

Compute the status once, immediately **after** `verified` is assigned (so the catch block can see it too):
```ts
    const suspended =
      effectiveStatus(churchRecord.status, churchRecord.graceUntil, new Date()) === 'suspended';
```

Then insert the early return **after** `await touchLastInbound(contact.id);` and **before** the `effectiveMode` / `loadMenuItems` block:
```ts
    // A suspended church's bot goes quiet. Everything that records member state
    // has already run above — the message row and lastInboundAt — so nothing is
    // lost, the inbox stays correctly ordered, and the 24h reply window is
    // accurate the moment the church is reactivated. Only routing and sending stop.
    if (suspended) {
      return NextResponse.json({ ok: true });
    }
```

**Position matters.** Placing this before `touchLastInbound` would leave `lastInboundAt` null for anyone who first writes during suspension: they would sink to the bottom of the inbox as a "never messaged" contact — the exact bug fixed in `c1872e5` — and `isReplyWindowOpen` would report their window closed on reactivation, blocking staff from replying.

Finally, guard the failure path so a suspended church cannot emit outbound messages. In the `catch` block, change the `notifyFailure` call to:
```ts
    // A suspended church must be completely silent — including apologies.
    if (verified && !suspended) {
      await notifyFailure(verified).catch((e) => console.error('Could not send error message', e));
    }
```
(`suspended` must therefore be declared with `let suspended = false;` alongside `verified` at the top of the handler, and assigned where Step 2 says.)

- [ ] **Step 3: Warn in the church panel**

In `src/app/admin/(protected)/layout.tsx`, add the imports:
```ts
import { getChurchById } from '@/lib/repo/church-admin';
import { effectiveStatus } from '@/lib/church-status';
```
After the existing `isAuthenticated` guard and before the `return`, add:
```tsx
  const church = session.churchId ? await getChurchById(session.churchId) : undefined;
  const status = church ? effectiveStatus(church.status, church.graceUntil, new Date()) : 'active';
```
and immediately inside the `<div className="container">`, above `{children}`:
```tsx
        {status === 'suspended' && (
          <p className="error">
            Assinatura suspensa — o painel está somente leitura e o bot não está respondendo.
            Entre em contato com o suporte para reativar.
          </p>
        )}
        {status === 'past_due' && (
          <p className="warn">
            Pagamento pendente. Regularize para não interromper o atendimento aos membros.
          </p>
        )}
```

- [ ] **Step 4: Refuse writes in every mutating action**

In each of these files, swap the session call in **every exported mutating action** from `requireSession()` to the guarded form. The pattern, applied per action:

```ts
import { requireWritableSession, blockedMessage } from '@/lib/auth/writable';

// inside each mutating action, replacing `const { churchId } = await requireSession();`
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;
```

Apply to every exported mutating action in:
- `conteudo/actions.ts` — `setItemActive`, `moveItem`
- `conteudo/item-actions.ts` — `createItem`, `editItem`
- `configuracoes/actions.ts` — `saveTexts`, `addStaff`, `removeStaff`
- `caixa/actions.ts` — `sendReplyToContact`, `endHandoff`
- `oracao/actions.ts` — `setPrayerStatus`

(`logout` needs no gate — signing out must always work.)

`endHandoff` currently returns `Promise<void>`, so change its signature to `Promise<{ error?: string }>`. `removeStaff` and `setPrayerStatus` already return `{ error?: string }` and need no signature change.

- [ ] **Step 5: Make EndHandoffButton read the returned error**

Changing `endHandoff` to *return* an error rather than throw silently breaks its only consumer: `EndHandoffButton` currently wraps the call in `try/catch`, which never fires for a resolved promise. A suspended church's staff would click "Encerrar atendimento", see "Encerrando…", and get **nothing** — no change and no explanation.

In `src/app/admin/(protected)/caixa/[contactId]/EndHandoffButton.tsx`, replace the `onClick` handler's transition body with:
```tsx
          start(async () => {
            try {
              // The action reports refusals by RETURNING an error (suspended or
              // revoked); only genuine faults throw. Check both.
              const result = await endHandoff(contactId);
              if (result?.error) setError(result.error);
            } catch {
              setError('Não foi possível encerrar. Tente novamente.');
            }
          });
```
This matches the pattern already used by `MenuList`'s `run()` and `PrayerList`'s `toggle()`.

- [ ] **Step 6: Gate the Blob upload token**

`POST /api/blob/upload` is an authenticated write endpoint that the action sweep above does not cover — its `onBeforeGenerateToken` only checks `isAuthenticated`. Without this, a suspended church's admin can still mint upload tokens and push 10 MB files while the banner says the panel is read-only.

In `src/app/api/blob/upload/route.ts`, replace the body of `onBeforeGenerateToken`'s auth check:
```ts
      onBeforeGenerateToken: async () => {
        const session = await requireWritableSession();
        if ('blocked' in session) {
          throw new Error('Não autorizado.');
        }
        return {
```
and add the import:
```ts
import { requireWritableSession } from '@/lib/auth/writable';
```
The thrown error is caught by the route's existing `try/catch` and returned as the 400 JSON the client already handles. `getSession`/`isAuthenticated` imports become unused here — remove them if nothing else in the file uses them.

- [ ] **Step 7: Typecheck, build and tests**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck exits 0; build succeeds; all tests pass.

Note that typecheck alone will **not** catch a missed `EndHandoffButton` update — the old `try/catch` still compiles against the new return type. Re-read Step 5 and confirm the returned error is actually inspected.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/writable.ts src/app/api/whatsapp/webhook/route.ts src/app/api/blob/upload/route.ts "src/app/admin/(protected)"
git commit -m "feat: suspended churches get a silent bot and a read-only panel"
```

---

## What this plan does NOT build

Deliberately deferred to later plans, per the spec's build order:

- **Stripe** — signup page, Checkout, the billing webhook, and automatic `past_due` / `grace_until` writes. Until then `status` is set by hand from the owner console, which is exactly enough to onboard and invoice church #2.
- **LGPD tooling** — per-church export, hard delete from the console, the 12-month retention purge, and the automated data-subject request flow. The seeded Privacidade text deliberately directs members to the church rather than promising a command that does not exist yet.
- **Public signup** — churches are provisioned by `provisionChurch()` called from a script or the console until Stripe lands.

## Verification reality

Only the pure logic is executable here: `effectiveStatus()` (unit-tested) and the tenant isolation suite (real Postgres via PGlite, no server needed). Everything DB/HTTP/browser-backed — provisioning, both logins, the owner console, suspension enforcement — is gated by `npm run typecheck` and `npm run build` and has **never run against Neon or a browser**. First real verification: apply `0001`, run `create-owner`, log in at `/owner`, and confirm a suspended church's bot stops replying while its messages keep being recorded.

## Self-Review

**Spec coverage:** provisioning (Task 4) with two reachable callers — the CLI (Task 6) and the owner-console form (Task 7) · single-church assumptions removed (Task 5) · `status` lifecycle + `effectiveStatus` computed on read, no cron (Tasks 1, 2) · grace period never silencing on missing data (Task 2) · `owner_user` separate table and login, structurally distinct and discriminated (Tasks 1, 5, 6) · owner church list with connection + menu-count warning (Task 7) · credential management and manual suspend/reactivate (Task 8) · churches see read-only status (Task 9) · suspended = silent bot + read-only panel, messages still recorded (Task 10) · seeded Privacidade item with the agreed wording (Task 4) · isolation suite, privilege-boundary guard and provisioning test as standing accountability evidence (Tasks 3, 4). Stripe and LGPD tooling are explicitly out of scope and listed above.

**Placeholder scan:** none — every code step carries complete code, and every command states its expected result. Task 10's Step 4 describes a mechanical repetition across five files rather than reprinting five near-identical files; the exact replacement pattern and the full list of affected functions are given.

**Type consistency:** `ChurchStatus` is defined once in `church-status.ts` and consumed by `platform.ts`, both owner screens, `writable.ts` and the webhook. `effectiveStatus(status, graceUntil, now)` has one signature at every call site. `ChurchSummary` is produced by `listChurches()` and consumed only by the list page. `OwnerSessionData` / `OwnerLoginState` / `OwnerActionResult` / `NewChurchState` are each defined once. `provisionChurch(name, adminEmail, password)` matches the Interfaces Reference and is called identically by the CLI and the console action. The blocked sentinel is `'suspended' | 'revoked'` in `writable.ts` and every call site routes it through `blockedMessage()`. `saveCredentials.bind(null, churchId)` and `createChurch` both yield the `(prevState, formData)` shape `useActionState` requires. `params` is awaited as a Promise in `/owner/[churchId]`.

**Findings folded in from the adversarial review** (all confirmed against the real source):

- **Critical — `provisionChurch()` had no caller.** The plan created it and nothing invoked it: `db:seed` only ever makes the first church, and `create-admin` pointed at an owner-console feature that did not exist. Fixed by adding `scripts/create-church.ts` (Task 6) and the "Nova igreja" form (Task 7), and by giving `create-admin` a real `--church <id>` flag instead of a dead end.
- **Orphan churches on a reused admin email.** `admin_user.email` is globally unique and there is no transaction, so a duplicate email committed the church row then threw — leaving a church nobody could log into, once per retry. Now pre-checked, with a compensating delete.
- **The privilege boundary was only a comment.** This repo has no ESLint, so nothing stopped church-facing code importing `repo/platform` and reading another tenant's `accessToken`. Now an executable test.
- **The suspension check sat before `touchLastInbound`.** It would have re-created the NULL-ordering bug fixed in `c1872e5` and reported the 24h reply window closed on reactivation. Position is now stated exactly, with the reason.
- **A suspended church could still speak** through `notifyFailure` in the webhook's catch block. Now guarded.
- **Owner actions declared an `error` the UI rendered but never set** — a duplicate `phone_number_id` (the likeliest owner mistake) surfaced as an unhandled 500 instead of a pt-BR message.
- **Guards trusted the cookie's identity forever**, so a removed admin kept full access until it expired. Both guards now re-read the row.
- **Credentials could never be cleared**, making it impossible to move a WhatsApp number between churches. Split into keep-on-blank for secrets, always-write for the non-secret ids.
- **`EndHandoffButton` would have swallowed the new returned error** — and, as the reviewer proved by implementing the plan in a sandbox, typecheck *and* build both pass while it does. Its code is now in the plan.
- **The Blob upload route** was the one authenticated write the action sweep missed.
- **`(painel)`** renamed to `(protected)`, matching the existing admin convention and the plan's own English-identifiers rule.

**Known follow-up (not blocking):** `listChurches()` issues two extra queries per church (menu count, last inbound). At tens of churches that is fine; if the console ever feels slow it becomes one grouped query.
