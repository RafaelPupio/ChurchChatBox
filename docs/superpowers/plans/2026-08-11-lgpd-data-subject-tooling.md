# LGPD Art. 18 Data-Subject Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each church a panel page that shows, exports, corrects and erases everything it holds about one member, plus a daily job that purges member data at 12 months — with an audit record that proves each deletion happened and is never a copy of what was deleted.

**Architecture:** One migration adds `erasure_record`, a `church.retention_purged_at` cursor and five indexes. Pure modules (cutoff, phone HMAC, export builders) carry the logic; church-scoped repos carry the queries; a system-only `repo/retention.ts` — importable by exactly one file, enforced by an amended privilege-boundary test — carries the cross-church purge. Erasure and retention both write their receipt `pending` **before** deleting and flip it to `done` after, so the dangerous direction (a receipt over surviving data) is impossible by ordering.

**Tech Stack:** Next.js 15 App Router (Server Components + Server Actions), Drizzle ORM over `neon-http`, PGlite for tests, vitest.

**Source spec:** `docs/superpowers/specs/2026-08-07-lgpd-data-subject-tooling.md` (revision 4). Where this plan and the spec disagree, the disagreement is called out inline with the reason — see Global Constraints C9.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **C1 — pt-BR only.** Every user-facing string (panel, bot, export file keys, error messages) is Brazilian Portuguese. Code identifiers stay English. Operator-facing output (cron route responses, `console.error`) stays English, like the existing CLI scripts.
- **C2 — the word "dízimo" appears nowhere.** Not in copy, not in comments, not in tests.
- **C3 — the bot never claims LGPD compliance.** The member-facing Privacidade text does not name the statute at all. Panel copy may cite `art. 18` as a reference for staff; member-facing text may not.
- **C4 — no church may read or write another church's data.** Every church-scoped query carries both predicates (`church_id` AND the row key). The single exception is `repo/retention.ts` and `listErasureSignals`, which are cross-church by construction and live behind the privilege boundary.
- **C5 — `src/lib/repo/platform.ts` is OWNER-ONLY.** Nothing under `src/app/admin/`, `src/app/api/` or `src/lib/` may import it. After Task 8 this is expressed as an empty importer set in `RESTRICTED`, not as a scanner exemption.
- **C6 — no member data leaves the request.** Nothing is written to Vercel Blob, to disk, to a log line, or to any store that outlives the request. The export exists only as stream chunks and then only in the secretary's browser.
- **C7 — the retention purge must ship before the Privacidade text v2.** Task 14 rewrites the text to promise *"as conversas e os pedidos de oração são apagados automaticamente após 12 meses"*. That sentence is only true once Task 8's cron runs. Shipping it earlier reintroduces the exact defect the current softened wording exists to avoid: the one menu item whose job is telling members the truth about their data becoming the one place the product lies. **Task 14 must not be started before Task 8 is complete.**
- **C8 — `neon-http` has no transactions.** `db.transaction` does not exist. Multi-statement atomicity is unavailable; every design here is either a single statement (which Postgres runs in an implicit transaction) or is explicitly idempotent and resumable.
- **C9 — the spec has drifted from the code in one place, and the code wins.** The spec (§"Schema changes") says `src/db/schema.ts:1-3` imports `uniqueIndex` but not `index`, and schedules an edit adding it. **That is now false**: [`schema.ts:2`](src/db/schema.ts) already imports `index` and `unique`, both added with the later `webhook_failure` table. Only `import { sql } from 'drizzle-orm'` is genuinely new. Task 1 states the real edit. No other spec claim was found stale, but implementers should read the file before trusting a line citation.
- **C10 — the test suite needs `--maxWorkers=4`.** `npx vitest run` unbounded spawns a PGlite instance per worker and times out on a loaded machine. Every "run the full suite" step in this plan uses `npx vitest run --maxWorkers=4`.
- **C11 — never soften a promise to hide a defect.** Where a count can lag, the copy says the count is unreliable; where an export is truncated, the file says so. Truncation, interruption and partial results are always visible to the reader, never silently absorbed.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `drizzle/<next>_<name>.sql` | The migration. Number assigned by `drizzle-kit generate` — never hardcoded. |
| `src/lib/retention.ts` | `RETENTION_MS`, `retentionCutoff(now)`. Nothing else. Pure. |
| `src/lib/erasure-hash.ts` | `hashPhone(phone)` → HMAC-SHA256 or `null`. Pure apart from reading one env var. |
| `src/lib/redact.ts` | `redactPhones(text)`, `redactError(error)`. Pure. |
| `src/lib/member-export.ts` | Three pure builders + the sharing/retention/notes constants. |
| `src/lib/repo/member-data.ts` | Church-scoped: load subject, count rows, keyset pages, delete member, rename. |
| `src/lib/repo/erasure.ts` | Church-scoped: open/complete/find erasure records. |
| `src/lib/repo/retention.ts` | **System-only, cross-church.** The purge statements, the fairness cursor, the sweeps. |
| `src/app/admin/(protected)/caixa/[contactId]/dados/page.tsx` | The member data page. `requireReadableSession`. |
| `src/app/admin/(protected)/caixa/[contactId]/dados/actions.ts` | `deleteMemberData`, `renameMember`. `requireDataRightsSession`. |
| `src/app/admin/(protected)/caixa/[contactId]/dados/ExportButtons.tsx` | Client component: fetch → blob download → read `aviso`/`continuacao`. |
| `src/app/api/dados/[contactId]/route.ts` | GET → member export stream. |
| `src/app/api/dados/oracoes-expirando/route.ts` | GET → expiring-prayers export stream. |
| `src/app/api/cron/purge/route.ts` | GET → the purge runner. Only importer of `repo/retention.ts`. |
| `vercel.json` | One cron entry. No file exists today. |

**Modified:**

| File | Change |
|---|---|
| `src/db/schema.ts` | `sql` import; `retentionPurgedAt` column; `erasureRecord` table + 2 enums; index entries on `message`, `prayer_request`, `contact`. |
| `src/lib/auth/writable.ts` | Extract `verifyIdentity`; add `requireDataRightsSession`, `checkDataRightsSession`. |
| `src/lib/repo/platform.ts` | One function: `listErasureSignals`. |
| `src/lib/repo/prayer-admin.ts` | `contactId` on `PrayerRequestWithContact`; `countExpiringPrayers`; `pageExpiringPrayers`. |
| `src/lib/church-defaults.ts` | `PRIVACY_ITEM_V1_BODY` frozen; `PRIVACY_ITEM.bodyText` → v2. |
| `src/app/admin/(protected)/caixa/[contactId]/page.tsx` | "Dados e privacidade" link. |
| `src/app/admin/(protected)/oracao/page.tsx` | 30-day expiring warning + link per row. |
| `src/app/admin/(protected)/configuracoes/page.tsx` | "Retenção e exclusões" panel. |
| `src/app/admin/(protected)/conteudo/page.tsx` | Privacidade guidance hint. |
| `src/app/owner/(protected)/page.tsx` | "Exclusões recentes" block. |
| `src/app/owner/(protected)/[churchId]/actions.ts` | `updatePrivacyText`. |
| `src/app/api/whatsapp/webhook/route.ts` | `redactError` on the catch-all log. |
| `src/app/admin/(protected)/caixa/actions.ts` | `redactError` on the catch-all log. |
| `tests/privilege-boundary.test.ts` | `RESTRICTED` importer-keyed map; `walk()` loses its `ALLOWED` skip. |
| `tests/repo-isolation.test.ts` | New church-scoped functions added to the two-church attack list. |
| `.env.example` | `ERASURE_HASH_SECRET`, `CRON_SECRET`. |

---

## Task Dependency Order

```
1 schema ──┬── 2 pure (retention, hash) ──┬── 5 repo/erasure ──┬── 9 page+actions ── 10 export route
           │                              │                   │
           ├── 3 export builders ─────────┤                   ├── 13 /owner signal
           │                              │                   │
           ├── 4 repo/member-data ────────┘                   └── 12 Configurações panel
           │
           ├── 6 guards ── 7 repo/retention ── 8 cron+boundary ── 11 prayer warning+export
           │                                        │
           │                                        └── C7 gate ── 14 privacy text v2
           └── 15 redaction (independent)
```

Tasks 1–8 must run in order. Tasks 9–13 depend on 1–6 and may be reordered among themselves. **Task 14 is gated on Task 8 by C7.** Task 15 is independent and may run at any point.

---

### Task 1: Schema, enums, indexes and the migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/<assigned by drizzle-kit>.sql`
- Create: `tests/erasure-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `erasureRecord`, `erasureReasonEnum`, `erasureStatusEnum` exported from `@/db/schema`; `church.retentionPurgedAt`. Later tasks import these names.

**Context an implementer needs:** this codebase applies migrations in tests by reading every `.sql` file in `drizzle/` in sorted order and splitting on `--> statement-breakpoint` (see `tests/repo-isolation.test.ts`). So a migration that PGlite cannot execute fails the whole suite, which is the safety net for a mis-generated index.

- [ ] **Step 1: Add the `sql` import to the schema**

Only this import is new. `index`, `unique` and `uniqueIndex` are **already imported** on line 2 — do not re-add them (see Global Constraint C9).

In `src/db/schema.ts`, after the existing `drizzle-orm/pg-core` import block (lines 1–3), add:

```ts
// New: the partial-index predicate and the coalesce() expression index below are
// raw SQL fragments. This file imported nothing from 'drizzle-orm' before.
import { sql } from 'drizzle-orm';
```

- [ ] **Step 2: Add the retention cursor column to `church`**

In the `church` table definition, immediately after the `courtesyText` column and before `createdAt`:

```ts
  /** Round-robin cursor for the cross-church retention purge. SYSTEM STATE: never
   *  rendered to a church, never editable in either panel, never seeded. Lives on
   *  `church` rather than in its own table so it disappears with the church for
   *  free. NULL means "never purged", which sorts first — see
   *  listChurchIdsForPurge's `NULLS FIRST`. */
  retentionPurgedAt: timestamp('retention_purged_at', { withTimezone: true }),
```

- [ ] **Step 3: Add index entries to `message`, `prayer_request` and `contact`**

`message` — its third argument already exists (`waMessageIdUq`); add two entries beside it:

```ts
}, (t) => ({
  waMessageIdUq: uniqueIndex('message_wa_message_id_uq').on(t.waMessageId),
  // The purge's age arm: church_id = $1 AND created_at < $cutoff.
  churchCreatedIdx: index('message_church_created_idx').on(t.churchId, t.createdAt),
  // ONE index serving TWO predicates: the purge's church-scoped NOT EXISTS guard
  // (leading pair) and the export's keyset page, whose ORDER BY is (created_at, id)
  // within one contact (all four columns). Two narrower indexes would be one more
  // than the work needs.
  contactKeysetIdx: index('message_contact_keyset_idx').on(t.churchId, t.contactId, t.createdAt, t.id),
}));
```

`prayer_request` — has **no** third argument today; add one:

```ts
export const prayerRequest = pgTable('prayer_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  status: prayerStatusEnum('status').notNull().default('novo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Serves the purge's age arm AND the 30-day expiring-prayers warning and export,
  // which are the same predicate at two different cutoffs.
  churchCreatedIdx: index('prayer_request_church_created_idx').on(t.churchId, t.createdAt),
  contactKeysetIdx: index('prayer_request_contact_keyset_idx').on(t.churchId, t.contactId, t.createdAt, t.id),
}));
```

`contact` — third argument already exists (`churchPhoneUq`); add one entry:

```ts
}, (t) => ({
  churchPhoneUq: uniqueIndex('contact_church_phone_uq').on(t.churchId, t.phone),
  // An EXPRESSION index, deliberately NOT ('church_id','last_inbound_at'). The idle
  // predicate is coalesce(last_inbound_at, created_at) < $cutoff, and a plain column
  // index is not sargable against a coalesce() over two columns.
  churchIdleIdx: index('contact_church_idle_idx')
    .on(t.churchId, sql`coalesce(${t.lastInboundAt}, ${t.createdAt})`),
}));
```

- [ ] **Step 4: Add the enums and the `erasure_record` table**

Append to the end of `src/db/schema.ts`:

```ts
export const erasureReasonEnum = pgEnum('erasure_reason', ['subject_request', 'retention']);
export const erasureStatusEnum = pgEnum('erasure_status', ['pending', 'done']);

/** Proof that a deletion happened, which is never a copy of what was deleted.
 *
 *  Two kinds of row share this table. A `subject_request` row is one member's
 *  Art. 18 VI erasure, performed by a named secretary. A `retention` row is one
 *  church's slice of one nightly purge. Both are written `pending` BEFORE any
 *  delete and flipped to `done` after, so the dangerous direction — a receipt
 *  asserting a deletion over data that still exists — is impossible by ordering
 *  rather than prevented by care.
 *
 *  Holds no phone, no name and no body text. If someone with database access
 *  wants to know WHO was erased they need ERASURE_HASH_SECRET and a candidate
 *  number to test: a guessing game, not a list. */
export const erasureRecord = pgTable('erasure_record', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  reason: erasureReasonEnum('reason').notNull(),
  status: erasureStatusEnum('status').notNull().default('pending'),
  /** Deliberately NOT a foreign key to contact. An FK would cascade this proof
   *  away together with the very row it exists to prove was deleted. Kept so the
   *  pending→done resume can find its target and so the partial unique index has
   *  something to key on; after the delete it is a random UUID correlating to
   *  nothing without a copy of the old database. */
  subjectContactId: uuid('subject_contact_id'),
  subjectPhoneHash: text('subject_phone_hash'),
  /** A text SNAPSHOT, not a reference to admin_user. An FK with ON DELETE SET NULL
   *  would erase the actor from the audit trail the day that secretary leaves the
   *  church — precisely when the record matters. */
  performedByEmail: text('performed_by_email'),
  messagesDeleted: integer('messages_deleted').notNull().default(0),
  prayersDeleted: integer('prayers_deleted').notNull().default(0),
  contactsDeleted: integer('contacts_deleted').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  churchCreatedIdx: index('erasure_record_church_created_idx').on(t.churchId, t.createdAt),
  phoneHashIdx: index('erasure_record_phone_hash_idx').on(t.churchId, t.subjectPhoneHash),
  /** THE guard that makes a double-click harmless: one subject-request receipt per
   *  contact, enforced by Postgres rather than by a read-then-write pre-check that
   *  would be TOCTOU. PARTIAL, so retention rows (subject_contact_id IS NULL) are
   *  unaffected — and a total unique index would have allowed unlimited NULLs
   *  anyway, i.e. enforced nothing where it matters. */
  subjectUq: uniqueIndex('erasure_record_subject_uq')
    .on(t.churchId, t.subjectContactId)
    .where(sql`${t.reason} = 'subject_request'`),
}));
```

- [ ] **Step 5: Generate the migration**

```bash
npm run db:generate
```

Expected: a new file in `drizzle/` (the number is whatever drizzle-kit assigns — do **not** rename it, and do not assume `0004`; the `_journal.json` entry and the filename must agree).

- [ ] **Step 6: Read the emitted SQL and hand-restore two shapes if needed**

Open the generated `.sql` file and verify **both** of these. This is a read-the-diff step, not an optional review:

1. The partial index carries its predicate. It must read:

```sql
CREATE UNIQUE INDEX "erasure_record_subject_uq" ON "erasure_record" USING btree ("church_id","subject_contact_id") WHERE "erasure_record"."reason" = 'subject_request';
```

If the `WHERE` is missing, the index becomes total and blocks the second retention row per church. Hand-restore it.

2. The idle index is over the **expression**, not the bare columns. It must contain `coalesce`:

```sql
CREATE INDEX "contact_church_idle_idx" ON "contact" USING btree ("church_id",coalesce("last_inbound_at", "created_at"));
```

If it emitted `("church_id","last_inbound_at")`, hand-restore the expression. **A dropped `WHERE` fails a test below; a wrong expression does not fail any correctness test** — it silently stops serving the idle predicate, which is the exact defect this index exists to fix. That asymmetry is why this step is explicit.

- [ ] **Step 7: Write the failing schema test**

Create `tests/erasure-schema.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/** The migration is the only place these guards exist. A dropped partial-index
 *  predicate, a missing column or a mistyped enum all produce code that
 *  typechecks and a database that does not enforce what the design relies on. */

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
let client: PGlite;
let churchId: string;
let contactId: string;

beforeAll(async () => {
  client = new PGlite();
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
       unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ('Igreja Esquema','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
  );
  churchId = c.rows[0].id;
  const ct = await client.query<{ id: string }>(
    `insert into contact (church_id,phone) values ($1,'5511900000000') returning id`,
    [churchId],
  );
  contactId = ct.rows[0].id;
});

describe('erasure_record schema', () => {
  it('accepts one subject_request receipt per contact', async () => {
    const r = await client.query<{ id: string }>(
      `insert into erasure_record (church_id,reason,status,subject_contact_id,messages_deleted,prayers_deleted,contacts_deleted)
       values ($1,'subject_request','pending',$2,5,2,1) returning id`,
      [churchId, contactId],
    );
    expect(r.rows).toHaveLength(1);
  });

  it('REJECTS a second subject_request receipt for the same contact', async () => {
    // This is the double-click guard, at the schema level. If drizzle-kit dropped
    // the partial predicate this insert succeeds and the test fails here.
    await expect(
      client.query(
        `insert into erasure_record (church_id,reason,status,subject_contact_id)
         values ($1,'subject_request','pending',$2)`,
        [churchId, contactId],
      ),
    ).rejects.toThrow(/erasure_record_subject_uq|unique/i);
  });

  it('allows MANY retention rows for one church — the partial predicate excludes them', async () => {
    for (let i = 0; i < 3; i += 1) {
      await client.query(
        `insert into erasure_record (church_id,reason,status) values ($1,'retention','done')`,
        [churchId],
      );
    }
    const rows = await client.query<{ n: string }>(
      `select count(*) as n from erasure_record where church_id = $1 and reason = 'retention'`,
      [churchId],
    );
    expect(Number(rows.rows[0].n)).toBe(3);
  });

  it('cascades receipts away with the church, and survives the contact', async () => {
    // The contact FK is deliberately absent: deleting the subject must NOT destroy
    // the proof that the subject was deleted.
    await client.query(`delete from contact where id = $1`, [contactId]);
    const kept = await client.query<{ n: string }>(
      `select count(*) as n from erasure_record where subject_contact_id = $1`,
      [contactId],
    );
    expect(Number(kept.rows[0].n)).toBe(1);

    await client.query(`delete from church where id = $1`, [churchId]);
    const gone = await client.query<{ n: string }>(
      `select count(*) as n from erasure_record where church_id = $1`,
      [churchId],
    );
    expect(Number(gone.rows[0].n)).toBe(0);
  });

  it('church carries the retention cursor, defaulting to NULL', async () => {
    const c = await client.query<{ retention_purged_at: Date | null }>(
      `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
         unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
       values ('Igreja Cursor','oi','menu','Ver opções','x','y','z','p','q','r','s')
       returning retention_purged_at`,
    );
    expect(c.rows[0].retention_purged_at).toBeNull();
  });
});

describe('the indexes the purge and export predicates need', () => {
  it('creates all five, and the idle one is over the coalesce EXPRESSION', async () => {
    const idx = await client.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where indexname in ('message_church_created_idx','message_contact_keyset_idx',
                            'prayer_request_church_created_idx','prayer_request_contact_keyset_idx',
                            'contact_church_idle_idx')`,
    );
    expect(idx.rows.map((r) => r.indexname).sort()).toEqual([
      'contact_church_idle_idx',
      'message_church_created_idx',
      'message_contact_keyset_idx',
      'prayer_request_church_created_idx',
      'prayer_request_contact_keyset_idx',
    ]);

    // A plain ("church_id","last_inbound_at") index cannot serve
    // coalesce(last_inbound_at, created_at) < $cutoff. Nothing else in the suite
    // would notice the difference, which is why this assertion is here.
    const idle = idx.rows.find((r) => r.indexname === 'contact_church_idle_idx')!;
    expect(idle.indexdef.toLowerCase()).toContain('coalesce');
  });
});
```

- [ ] **Step 8: Run the test and watch it fail if the migration is wrong**

```bash
npx vitest run tests/erasure-schema.test.ts
```

Expected: PASS if steps 1–6 were done correctly. If `REJECTS a second subject_request receipt` fails, the partial predicate was dropped — go back to step 6.1. If `the idle one is over the coalesce EXPRESSION` fails, go back to step 6.2.

- [ ] **Step 9: Run the full suite — the migration touches every PGlite test**

```bash
npx vitest run --maxWorkers=4
```

Expected: all previously passing tests still pass. Every PGlite suite applies this new migration, so a statement PGlite cannot execute shows up here as a broad failure rather than a single one.

- [ ] **Step 10: Add the new environment variables**

Append to `.env.example`:

```
# Keys the HMAC that lets the panel confirm "this number was erased" without
# storing the number. If unset, erasures still run and store a null hash — a
# missing operator env var must never be the reason a statutory erasure fails.
ERASURE_HASH_SECRET=""

# Vercel injects this as a Bearer token on cron requests. If unset, the purge
# endpoint REFUSES to run: an unauthenticated delete endpoint is a public delete
# button, and this is the one guard in the codebase that fails closed.
CRON_SECRET=""
```

- [ ] **Step 11: Commit**

```bash
git add src/db/schema.ts drizzle/ tests/erasure-schema.test.ts .env.example
git commit -m "feat(lgpd): a deletion must leave proof that is not a copy of what it deleted"
```

---

### Task 2: The two pure modules — retention cutoff and phone HMAC

**Files:**
- Create: `src/lib/retention.ts`
- Create: `src/lib/erasure-hash.ts`
- Create: `tests/retention-cutoff.test.ts`
- Create: `tests/erasure-hash.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RETENTION_MS: number`, `retentionCutoff(now: Date): Date` from `@/lib/retention`
  - `hashPhone(phone: string): string | null` from `@/lib/erasure-hash`

- [ ] **Step 1: Write the failing cutoff test**

Create `tests/retention-cutoff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RETENTION_MS, retentionCutoff } from '@/lib/retention';

const DAY = 24 * 60 * 60 * 1000;

describe('retentionCutoff', () => {
  it('is 365 days', () => {
    expect(RETENTION_MS).toBe(365 * DAY);
  });

  it('returns now minus 365 days', () => {
    const now = new Date('2026-08-11T06:00:00.000Z');
    expect(retentionCutoff(now).toISOString()).toBe('2025-08-11T06:00:00.000Z');
  });

  it('a row exactly 365 days old is NOT past the cutoff', () => {
    // The purge predicate is `created_at < cutoff`, strictly. A row whose age is
    // exactly the retention period survives one more day, which is the forgiving
    // direction and the one a member would expect.
    const now = new Date('2026-08-11T06:00:00.000Z');
    const exactly = new Date(now.getTime() - RETENTION_MS);
    expect(exactly < retentionCutoff(now)).toBe(false);
  });

  it('one second older is past it; one second younger is not', () => {
    const now = new Date('2026-08-11T06:00:00.000Z');
    const cutoff = retentionCutoff(now);
    expect(new Date(now.getTime() - RETENTION_MS - 1000) < cutoff).toBe(true);
    expect(new Date(now.getTime() - RETENTION_MS + 1000) < cutoff).toBe(false);
  });

  it('does not read the clock itself', () => {
    // Purity: the same input twice gives the same answer, so a test can pin a date
    // and the purge can be driven from a fixture rather than from wall time.
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(retentionCutoff(now).getTime()).toBe(retentionCutoff(now).getTime());
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/retention-cutoff.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/retention"`.

- [ ] **Step 3: Write `src/lib/retention.ts`**

```ts
/** How long a church keeps a member's data. One constant, one function, no I/O.
 *
 *  365 days rather than "12 calendar months": the drift is at most a day, and a
 *  fixed number is testable, has one place to change, and cannot disagree with
 *  itself across a leap year. The member-facing promise says "12 meses", which is
 *  what 365 days is in every sense a member cares about.
 *
 *  This number is a PRODUCT decision reflected in a promise the bot already makes
 *  — not a legal determination. Changing it changes the Privacidade text too. */
export const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

/** Everything strictly older than this is purged. Pure: takes the clock as an
 *  argument so the purge can be driven from a fixture and so this file never
 *  becomes untestable. */
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_MS);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/retention-cutoff.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing hash test**

Create `tests/erasure-hash.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPhone } from '@/lib/erasure-hash';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hashPhone', () => {
  it('returns a stable hex digest for the same number', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    const a = hashPhone('5511999998888');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPhone('5511999998888')).toBe(a);
  });

  it('normalises to digits, so formatting never changes the answer', () => {
    // The same person's number is written a dozen ways across WhatsApp, a
    // secretary's typing, and the verify box. If those hash differently the
    // verification box answers "nenhuma exclusão registrada" for a number that
    // was in fact erased — the one question this hash exists to answer.
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    const canonical = hashPhone('5511999998888');
    expect(hashPhone('+55 11 99999-8888')).toBe(canonical);
    expect(hashPhone('(55) 11 99999 8888')).toBe(canonical);
    expect(hashPhone(' 5511999998888 ')).toBe(canonical);
  });

  it('different numbers hash differently', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    expect(hashPhone('5511999998888')).not.toBe(hashPhone('5511999998889'));
  });

  it('is keyed — a different secret gives a different digest', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-a');
    const a = hashPhone('5511999998888');
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-b');
    expect(hashPhone('5511999998888')).not.toBe(a);
  });

  it('returns null when the secret is unset — it never throws', () => {
    // Fails TOWARD the member's right, mirroring effectiveStatus's fail-toward-
    // service. A missing operator env var must never be the reason a statutory
    // erasure does not happen; the erasure proceeds and stores a null hash.
    vi.stubEnv('ERASURE_HASH_SECRET', '');
    expect(hashPhone('5511999998888')).toBeNull();
  });

  it('returns null for a number with no digits at all', () => {
    vi.stubEnv('ERASURE_HASH_SECRET', 'segredo-de-teste');
    expect(hashPhone('')).toBeNull();
    expect(hashPhone('sem números')).toBeNull();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

```bash
npx vitest run tests/erasure-hash.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/erasure-hash"`.

- [ ] **Step 7: Write `src/lib/erasure-hash.ts`**

```ts
import { createHmac } from 'node:crypto';

/** A one-way fingerprint of a phone number, so an erasure receipt can answer
 *  "sim, este número foi apagado em 12/03" without being a list of the people who
 *  asked to be erased.
 *
 *  KEYED (HMAC), not a bare hash. A plain SHA-256 of a phone number is trivially
 *  reversible: the search space is a few billion, and anyone holding the database
 *  could enumerate it in minutes. The key is what makes the digest testable only
 *  by someone who already has both the secret and a candidate number — a guessing
 *  game rather than a lookup.
 *
 *  The result is PSEUDONYMISED, not anonymous, and therefore still personal data
 *  under LGPD. It is retained under Art. 16 I as the accountability record Art. 6 X
 *  requires — which is also why it never crosses to the vendor's /owner view. */
export function hashPhone(phone: string): string | null {
  const secret = process.env.ERASURE_HASH_SECRET;
  // Deliberately not a throw. See the test: a missing operator env var must never
  // block a statutory erasure. The caller stores null and the verify box says the
  // check is unavailable in this installation.
  if (!secret) return null;

  // Digits only, so the same person hashes the same way whether the number was
  // typed as +55 11 99999-8888, (55) 11 99999 8888, or copied raw from WhatsApp.
  const digits = phone.replace(/\D+/g, '');
  if (!digits) return null;

  return createHmac('sha256', secret).update(digits).digest('hex');
}
```

- [ ] **Step 8: Run it and watch it pass**

```bash
npx vitest run tests/erasure-hash.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/retention.ts src/lib/erasure-hash.ts tests/retention-cutoff.test.ts tests/erasure-hash.test.ts
git commit -m "feat(lgpd): the cutoff and the fingerprint, as pure functions"
```

---

### Task 3: The export builders

**Files:**
- Create: `src/lib/member-export.ts`
- Create: `tests/member-export.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `@/lib/member-export`:
  - `SHARING_DISCLOSURE: string[]`, `RETENTION_NOTE: string`, `EXPORT_NOTES: string[]`
  - `exportHeader(input: ExportHeaderInput): ExportHeader`
  - `exportMessageEntry(row: ExportMessageRow): ExportMessageEntry`
  - `exportPrayerEntry(row: ExportPrayerRow): ExportPrayerEntry`
  - `exportFooter(input: { truncatedAt: Date | null; continuation: string | null }): ExportFooter`
  - `truncationNotice(at: Date): string`

**Why three builders and not one `buildMemberExport`:** the route streams pages and never holds the whole history in memory. A single builder taking materialised arrays would force the route to load every row first — failing on precisely the member whose Art. 18 V deadline matters most.

- [ ] **Step 1: Write the failing test**

Create `tests/member-export.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EXPORT_NOTES,
  RETENTION_NOTE,
  SHARING_DISCLOSURE,
  exportFooter,
  exportHeader,
  exportMessageEntry,
  exportPrayerEntry,
  truncationNotice,
} from '@/lib/member-export';

describe('exportHeader', () => {
  it('carries the church, the subject and honest totals', () => {
    const header = exportHeader({
      churchName: 'Igreja Exemplo',
      contact: {
        name: 'Maria',
        phone: '5511999998888',
        createdAt: new Date('2026-01-04T18:22:00.000Z'),
        lastInboundAt: new Date('2026-08-01T13:40:00.000Z'),
      },
      counts: { messages: 412, prayers: 3 },
      now: new Date('2026-08-07T09:00:00.000Z'),
    });

    expect(header).toEqual({
      gerado_em: '2026-08-07T09:00:00.000Z',
      igreja: 'Igreja Exemplo',
      titular: {
        nome: 'Maria',
        whatsapp: '5511999998888',
        primeiro_registro: '2026-01-04T18:22:00.000Z',
        ultima_mensagem_recebida: '2026-08-01T13:40:00.000Z',
        total_de_mensagens: 412,
        total_de_pedidos_de_oracao: 3,
      },
    });
  });

  it('keeps a null name and a null last-inbound as null, not as ""', () => {
    // A member whose WhatsApp profile name we never saw has no name. Rendering
    // that as an empty string tells them we hold a blank, which is a different
    // and untrue statement about their data.
    const header = exportHeader({
      churchName: 'Igreja Exemplo',
      contact: { name: null, phone: '5511777776666', createdAt: new Date('2026-02-01T00:00:00.000Z'), lastInboundAt: null },
      counts: { messages: 0, prayers: 0 },
      now: new Date('2026-08-07T09:00:00.000Z'),
    });
    expect(header.titular.nome).toBeNull();
    expect(header.titular.ultima_mensagem_recebida).toBeNull();
  });
});

describe('exportMessageEntry', () => {
  it('maps direction to membro/igreja and keeps only three keys', () => {
    expect(exportMessageEntry({
      id: '7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77',
      waMessageId: 'wamid.HBgNNTUxMTk5OTk5ODg4OA==',
      direction: 'inbound',
      body: 'Oi, qual o horário do culto?',
      createdAt: new Date('2026-01-04T18:22:00.000Z'),
    })).toEqual({
      quando: '2026-01-04T18:22:00.000Z',
      de: 'membro',
      texto: 'Oi, qual o horário do culto?',
    });
  });

  it('maps outbound to igreja', () => {
    expect(exportMessageEntry({
      id: 'a', waMessageId: null, direction: 'outbound',
      body: 'Escolha uma opção:', createdAt: new Date('2026-01-04T18:22:03.000Z'),
    }).de).toBe('igreja');
  });

  it('EXCLUDES wa_message_id and the internal UUID', () => {
    // wamid values are widely reported to encode the counterpart's phone number in
    // a base64 segment. Unverifiable here (no live Meta app), so the safe
    // assumption is that it identifies the member: it means nothing to them and
    // re-exporting it would hand back an identifier inside a privacy artifact.
    const entry = exportMessageEntry({
      id: '7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77',
      waMessageId: 'wamid.HBgNNTUxMTk5OTk5ODg4OA==',
      direction: 'inbound', body: 'oi', createdAt: new Date(),
    });
    expect(Object.keys(entry).sort()).toEqual(['de', 'quando', 'texto']);
    expect(JSON.stringify(entry)).not.toContain('wamid');
    expect(JSON.stringify(entry)).not.toContain('7c1e8b2a');
  });

  it('keeps a null body as null — a media message is a real event', () => {
    // The webhook writes null for anything that is not text or a list reply. The
    // member sent something; we did not keep it. "null" says exactly that, and
    // EXPORT_NOTES explains it in words.
    expect(exportMessageEntry({
      id: 'a', waMessageId: null, direction: 'inbound', body: null, createdAt: new Date(),
    }).texto).toBeNull();
  });
});

describe('exportPrayerEntry', () => {
  it('carries when, situacao and texto only', () => {
    expect(exportPrayerEntry({
      id: 'p1',
      status: 'orado',
      text: 'meu filho faz cirurgia amanhã',
      createdAt: new Date('2026-03-02T20:10:00.000Z'),
    })).toEqual({
      quando: '2026-03-02T20:10:00.000Z',
      situacao: 'orado',
      texto: 'meu filho faz cirurgia amanhã',
    });
  });
});

describe('exportFooter', () => {
  it('carries sharing, retention and notes, and NO aviso when complete', () => {
    const footer = exportFooter({ truncatedAt: null, continuation: null });
    expect(footer.compartilhamento).toEqual(SHARING_DISCLOSURE);
    expect(footer.retencao).toBe(RETENTION_NOTE);
    expect(footer.observacoes).toEqual(EXPORT_NOTES);
    expect('aviso' in footer).toBe(false);
    expect('continuacao' in footer).toBe(false);
  });

  it('gains aviso AND continuacao only when truncated', () => {
    const footer = exportFooter({
      truncatedAt: new Date('2026-03-12T19:04:11.208Z'),
      continuation: 'mensagens:2026-03-12T19:04:11.208Z,7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77',
    });
    expect(footer.aviso).toBe(
      'Este arquivo vai até 12/03/2026. Havia mais dados do que cabe em um único arquivo — a secretaria da igreja pode gerar o restante em um segundo arquivo.',
    );
    expect(footer.continuacao).toBe('mensagens:2026-03-12T19:04:11.208Z,7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77');
  });

  it('names sharing explicitly — Art. 18 VII', () => {
    // The single gap that forced the Privacidade text revision: the old text did
    // not mention sharing at all.
    expect(SHARING_DISCLOSURE.join(' ')).toContain('WhatsApp');
    expect(SHARING_DISCLOSURE.join(' ')).toContain('Não vendemos');
  });

  it('never claims the copy is everything that exists', () => {
    // Deletion is bounded by our database. Meta's copy and the member's own handset
    // are outside it, and a privacy artifact that implied otherwise would be the
    // product overpromising in the one file whose job is honesty.
    expect(EXPORT_NOTES.join(' ')).toContain('WhatsApp');
    expect(EXPORT_NOTES.join(' ')).toContain('fora do controle');
  });
});

describe('truncationNotice', () => {
  it('renders a Brazilian date, not an ISO string', () => {
    expect(truncationNotice(new Date('2026-03-12T19:04:11.208Z'))).toContain('12/03/2026');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/member-export.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/member-export"`.

- [ ] **Step 3: Write `src/lib/member-export.ts`**

```ts
/** The member's Art. 18 V copy, as THREE pure builders rather than one.
 *
 *  The route streams: header, then pages of entries, then footer. It never holds
 *  the whole history, so there is no point at which a `buildMemberExport(church,
 *  contact, messages[], prayers[])` could be called — that signature would force
 *  the route to materialise every row first and would fail on exactly the member
 *  with the most data.
 *
 *  Keys are pt-BR because a member reads them. (Code identifiers stay English;
 *  the binding pt-BR rule is about user-facing text, and a JSON key handed to a
 *  Brazilian member is user-facing text.) */

/** Art. 18 VII — who else sees this. The same answer for every member of every
 *  church, which is why it is a constant and not a query. */
export const SHARING_DISCLOSURE: string[] = [
  'WhatsApp (Meta Platforms) — é por onde a conversa acontece.',
  'Serviços de hospedagem e banco de dados que executam o sistema da igreja.',
  'Não vendemos, alugamos nem cedemos estes dados a terceiros.',
];

export const RETENTION_NOTE =
  'As conversas e os pedidos de oração são apagados automaticamente após 12 meses.';

export const EXPORT_NOTES: string[] = [
  'Áudios, fotos e outros arquivos enviados não são guardados por nós — apenas o registro de que uma mídia chegou.',
  'Esta cópia contém apenas o que a igreja guarda. A conversa também existe no seu aparelho e nos servidores do WhatsApp, fora do controle da igreja.',
];

export interface ExportHeaderInput {
  churchName: string;
  contact: { name: string | null; phone: string; createdAt: Date; lastInboundAt: Date | null };
  counts: { messages: number; prayers: number };
  now: Date;
}

export interface ExportHeader {
  gerado_em: string;
  igreja: string;
  titular: {
    nome: string | null;
    whatsapp: string;
    primeiro_registro: string;
    ultima_mensagem_recebida: string | null;
    total_de_mensagens: number;
    total_de_pedidos_de_oracao: number;
  };
}

export function exportHeader(input: ExportHeaderInput): ExportHeader {
  const { churchName, contact, counts, now } = input;
  return {
    gerado_em: now.toISOString(),
    igreja: churchName,
    titular: {
      // null stays null. An empty string would assert we hold a blank name, which
      // is a different claim from "we never saw one".
      nome: contact.name,
      whatsapp: contact.phone,
      primeiro_registro: contact.createdAt.toISOString(),
      ultima_mensagem_recebida: contact.lastInboundAt ? contact.lastInboundAt.toISOString() : null,
      total_de_mensagens: counts.messages,
      total_de_pedidos_de_oracao: counts.prayers,
    },
  };
}

export interface ExportMessageRow {
  id: string;
  waMessageId: string | null;
  direction: 'inbound' | 'outbound';
  body: string | null;
  createdAt: Date;
}

export interface ExportMessageEntry {
  quando: string;
  de: 'membro' | 'igreja';
  texto: string | null;
}

export function exportMessageEntry(row: ExportMessageRow): ExportMessageEntry {
  // `id` and `waMessageId` are accepted and DROPPED, deliberately: the caller
  // needs them for the keyset cursor, and this builder is the boundary at which
  // they stop travelling. A wamid may encode the member's own phone number.
  return {
    quando: row.createdAt.toISOString(),
    de: row.direction === 'inbound' ? 'membro' : 'igreja',
    texto: row.body,
  };
}

export interface ExportPrayerRow {
  id: string;
  status: 'novo' | 'orado';
  text: string;
  createdAt: Date;
}

export interface ExportPrayerEntry {
  quando: string;
  situacao: 'novo' | 'orado';
  texto: string;
}

export function exportPrayerEntry(row: ExportPrayerRow): ExportPrayerEntry {
  return { quando: row.createdAt.toISOString(), situacao: row.status, texto: row.text };
}

export interface ExportFooter {
  compartilhamento: string[];
  retencao: string;
  observacoes: string[];
  aviso?: string;
  continuacao?: string;
}

/** Brazilian date for a human. The cursor beside it is opaque and machine-read;
 *  human-readable and machine-resumable are different jobs and one value cannot
 *  do both — a date cannot name a position inside a day. */
export function truncationNotice(at: Date): string {
  const d = at.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  return `Este arquivo vai até ${d}. Havia mais dados do que cabe em um único arquivo — a secretaria da igreja pode gerar o restante em um segundo arquivo.`;
}

export function exportFooter(input: {
  truncatedAt: Date | null;
  continuation: string | null;
}): ExportFooter {
  const footer: ExportFooter = {
    compartilhamento: SHARING_DISCLOSURE,
    retencao: RETENTION_NOTE,
    observacoes: EXPORT_NOTES,
  };
  // Both keys appear together or not at all. A file carrying `aviso` without
  // `continuacao` would tell the secretary data is missing and give them no way
  // to fetch it; truncation is never silent AND never a dead end.
  if (input.truncatedAt && input.continuation) {
    footer.aviso = truncationNotice(input.truncatedAt);
    footer.continuacao = input.continuation;
  }
  return footer;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/member-export.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/member-export.ts tests/member-export.test.ts
git commit -m "feat(lgpd): the member's copy, as builders that never hold the whole history"
```

---

### Task 4: `repo/member-data.ts` — the church-scoped member queries

**Files:**
- Create: `src/lib/repo/member-data.ts`
- Modify: `tests/repo-isolation.test.ts`
- Create: `tests/member-data-repo.test.ts`

**Interfaces:**
- Consumes: `@/db/schema` (`contact`, `message`, `prayerRequest`).
- Produces, from `@/lib/repo/member-data`:
  - `loadMemberSubject(churchId, contactId): Promise<MemberSubject | null>`
  - `countMemberRows(churchId, contactId): Promise<{ messages: number; prayers: number; prayersNovo: number }>`
  - `pageMessages(churchId, contactId, after: Cursor | null, limit): Promise<ExportMessageRow[]>`
  - `pagePrayers(churchId, contactId, after: Cursor | null, limit): Promise<ExportPrayerRow[]>`
  - `deleteMember(churchId, contactId): Promise<number>` — rows deleted, 0 or 1
  - `renameContact(churchId, contactId, name): Promise<number>`
  - `export interface Cursor { createdAt: Date; id: string }`

**House rules this task must follow:** every query carries **both** predicates (`church_id` AND the row key) — this is the pattern `tests/repo-isolation.test.ts` attacks with two churches. Timestamps in raw SQL go as ISO text with an explicit `::timestamptz` cast (see `src/lib/repo/password-reset.ts:70-73`); this task uses the drizzle query builder throughout, where drizzle handles the encoding per driver.

- [ ] **Step 1: Write the failing repo test**

Create `tests/member-data-repo.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__memberDataClient = client;
  return { db: drizzle(client, { schema }) };
});

import {
  countMemberRows,
  deleteMember,
  loadMemberSubject,
  pageMessages,
  pagePrayers,
  renameContact,
} from '@/lib/repo/member-data';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
let client: PGlite;
let churchId: string;
let contactId: string;

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__memberDataClient as PGlite;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }

  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
       unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ('Igreja Dados','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
  );
  churchId = c.rows[0].id;
  const ct = await client.query<{ id: string }>(
    `insert into contact (church_id,phone,name,last_inbound_at,created_at)
     values ($1,'5511999998888','Maria','2026-08-01T13:40:00Z','2026-01-04T18:22:00Z') returning id`,
    [churchId],
  );
  contactId = ct.rows[0].id;

  // Three messages a second apart, plus two sharing one created_at to the
  // millisecond — the case a date cursor cannot split.
  await client.query(
    `insert into message (church_id,contact_id,direction,body,created_at) values
      ($1,$2,'inbound','primeira','2026-01-04T18:22:00.000Z'),
      ($1,$2,'outbound','segunda','2026-01-04T18:22:01.000Z'),
      ($1,$2,'inbound','terceira','2026-01-04T18:22:02.000Z'),
      ($1,$2,'inbound','empate A','2026-02-01T10:00:00.000Z'),
      ($1,$2,'inbound','empate B','2026-02-01T10:00:00.000Z')`,
    [churchId, contactId],
  );
  await client.query(
    `insert into prayer_request (church_id,contact_id,text,status,created_at) values
      ($1,$2,'ore por minha mãe','novo','2026-03-02T20:10:00Z'),
      ($1,$2,'ore pelo meu filho','orado','2026-03-03T20:10:00Z')`,
    [churchId, contactId],
  );
});

describe('loadMemberSubject', () => {
  it('returns the contact for its own church', async () => {
    const s = await loadMemberSubject(churchId, contactId);
    expect(s).not.toBeNull();
    expect(s!.name).toBe('Maria');
    expect(s!.phone).toBe('5511999998888');
  });

  it('returns null for a contactId that does not exist', async () => {
    expect(await loadMemberSubject(churchId, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('countMemberRows', () => {
  it('counts messages, prayers, and prayers still marked novo separately', async () => {
    // prayersNovo drives a warning the secretary must see before deleting: the
    // church is about to lose prayers it has not yet prayed for.
    expect(await countMemberRows(churchId, contactId)).toEqual({
      messages: 5, prayers: 2, prayersNovo: 1,
    });
  });

  it('returns zeros rather than throwing for an unknown contact', async () => {
    expect(await countMemberRows(churchId, '00000000-0000-0000-0000-000000000000'))
      .toEqual({ messages: 0, prayers: 0, prayersNovo: 0 });
  });
});

describe('pageMessages', () => {
  it('pages ascending by (created_at, id) and never repeats a row', async () => {
    const first = await pageMessages(churchId, contactId, null, 2);
    expect(first.map((m) => m.body)).toEqual(['primeira', 'segunda']);

    const second = await pageMessages(
      churchId, contactId,
      { createdAt: first[1].createdAt, id: first[1].id },
      2,
    );
    expect(second.map((m) => m.body)).toEqual(['terceira', 'empate A']);
  });

  it('splits rows that share a created_at to the millisecond', async () => {
    // The whole reason the cursor is (created_at, id) and not a date: resuming at
    // >= a timestamp re-exports the tie, resuming at > skips it. There is no third
    // option, so a date cursor cannot be both gapless and overlap-free.
    const all = await pageMessages(churchId, contactId, null, 100);
    const tied = all.filter((m) => m.body?.startsWith('empate'));
    expect(tied).toHaveLength(2);

    const afterFirstTie = await pageMessages(
      churchId, contactId,
      { createdAt: tied[0].createdAt, id: tied[0].id },
      100,
    );
    expect(afterFirstTie.map((m) => m.body)).toEqual(['empate B']);
  });

  it('returns the rows the export builder needs and nothing extra', async () => {
    const [row] = await pageMessages(churchId, contactId, null, 1);
    expect(Object.keys(row).sort()).toEqual(['body', 'createdAt', 'direction', 'id', 'waMessageId']);
  });
});

describe('pagePrayers', () => {
  it('pages ascending and carries status', async () => {
    const rows = await pagePrayers(churchId, contactId, null, 10);
    expect(rows.map((p) => p.status)).toEqual(['novo', 'orado']);
  });
});

describe('renameContact', () => {
  it('renames within the church and reports one row', async () => {
    expect(await renameContact(churchId, contactId, 'Maria de Souza')).toBe(1);
    expect((await loadMemberSubject(churchId, contactId))!.name).toBe('Maria de Souza');
  });
});

describe('deleteMember', () => {
  it('deletes the contact and cascades messages and prayers in ONE statement', async () => {
    // neon-http has no transactions. A multi-table delete could not be made
    // atomic, so there is no multi-table delete: one DELETE FROM contact runs in
    // Postgres's implicit per-statement transaction and the FK cascades do the
    // rest. A half-deleted member is designed out, not compensated for.
    expect(await deleteMember(churchId, contactId)).toBe(1);

    for (const table of ['contact', 'message', 'prayer_request']) {
      const r = await client.query<{ n: string }>(
        `select count(*) as n from ${table} where church_id = $1`, [churchId],
      );
      expect(Number(r.rows[0].n), `${table} should be empty`).toBe(0);
    }
  });

  it('is idempotent — a second delete reports zero rows', async () => {
    expect(await deleteMember(churchId, contactId)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/member-data-repo.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/repo/member-data"`.

- [ ] **Step 3: Write `src/lib/repo/member-data.ts`**

```ts
import { and, asc, count, eq, gt, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact, message, prayerRequest } from '@/db/schema';
import type { ExportMessageRow, ExportPrayerRow } from '@/lib/member-export';

/** Everything the panel and the export need about ONE member.
 *
 *  Church-scoped like every other repo here: each query carries both predicates,
 *  church_id AND the row key, so another church's contactId is simply not found
 *  rather than found-and-then-checked. tests/repo-isolation.test.ts attacks these
 *  with two churches. */

export interface MemberSubject {
  id: string;
  name: string | null;
  phone: string;
  mode: 'bot' | 'awaiting_prayer' | 'human';
  lastInboundAt: Date | null;
  createdAt: Date;
}

export async function loadMemberSubject(
  churchId: string,
  contactId: string,
): Promise<MemberSubject | null> {
  const rows = await db
    .select({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      mode: contact.mode,
      lastInboundAt: contact.lastInboundAt,
      createdAt: contact.createdAt,
    })
    .from(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.id, contactId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface MemberCounts {
  messages: number;
  prayers: number;
  /** Prayers the church has not marked as prayed for. Surfaced separately because
   *  deleting them is a real pastoral cost the secretary should absorb knowingly,
   *  not discover afterwards. */
  prayersNovo: number;
}

export async function countMemberRows(churchId: string, contactId: string): Promise<MemberCounts> {
  const [m] = await db
    .select({ n: count() })
    .from(message)
    .where(and(eq(message.churchId, churchId), eq(message.contactId, contactId)));
  const [p] = await db
    .select({ n: count() })
    .from(prayerRequest)
    .where(and(eq(prayerRequest.churchId, churchId), eq(prayerRequest.contactId, contactId)));
  const [pn] = await db
    .select({ n: count() })
    .from(prayerRequest)
    .where(and(
      eq(prayerRequest.churchId, churchId),
      eq(prayerRequest.contactId, contactId),
      eq(prayerRequest.status, 'novo'),
    ));
  return { messages: m?.n ?? 0, prayers: p?.n ?? 0, prayersNovo: pn?.n ?? 0 };
}

/** A position in a keyset page: the last row handed out. */
export interface Cursor {
  createdAt: Date;
  id: string;
}

/** Keyset, not OFFSET. Two reasons: OFFSET re-scans everything it skips, and it
 *  is unstable under concurrent inserts — a member writing mid-export would shift
 *  every later page and duplicate or drop rows. The (created_at, id) pair is
 *  total: id breaks ties between rows sharing a millisecond, which is the case a
 *  date-granular cursor provably cannot split in either direction.
 *
 *  Covered by message_contact_keyset_idx (church_id, contact_id, created_at, id) —
 *  exactly these four columns, in this order. */
function keysetAfter(
  createdAtCol: typeof message.createdAt,
  idCol: typeof message.id,
  after: Cursor | null,
) {
  if (!after) return undefined;
  return or(
    gt(createdAtCol, after.createdAt),
    and(eq(createdAtCol, after.createdAt), gt(idCol, after.id)),
  );
}

export async function pageMessages(
  churchId: string,
  contactId: string,
  after: Cursor | null,
  limit: number,
): Promise<ExportMessageRow[]> {
  return db
    .select({
      id: message.id,
      waMessageId: message.waMessageId,
      direction: message.direction,
      body: message.body,
      createdAt: message.createdAt,
    })
    .from(message)
    .where(and(
      eq(message.churchId, churchId),
      eq(message.contactId, contactId),
      keysetAfter(message.createdAt, message.id, after),
    ))
    .orderBy(asc(message.createdAt), asc(message.id))
    .limit(limit);
}

export async function pagePrayers(
  churchId: string,
  contactId: string,
  after: Cursor | null,
  limit: number,
): Promise<ExportPrayerRow[]> {
  return db
    .select({
      id: prayerRequest.id,
      status: prayerRequest.status,
      text: prayerRequest.text,
      createdAt: prayerRequest.createdAt,
    })
    .from(prayerRequest)
    .where(and(
      eq(prayerRequest.churchId, churchId),
      eq(prayerRequest.contactId, contactId),
      keysetAfter(prayerRequest.createdAt, prayerRequest.id, after),
    ))
    .orderBy(asc(prayerRequest.createdAt), asc(prayerRequest.id))
    .limit(limit);
}

/** ONE statement. message.contact_id and prayer_request.contact_id are both
 *  ON DELETE CASCADE, and a single statement in Postgres runs in an implicit
 *  transaction — so the cascade is atomic even though neon-http has no
 *  db.transaction. This is the whole answer to "a multi-table delete will fail
 *  halfway": there is no multi-table delete.
 *
 *  Returns 0 or 1. Idempotent, which is what makes the erasure retry path and the
 *  nightly sweep safe to run against a member who is already gone. */
export async function deleteMember(churchId: string, contactId: string): Promise<number> {
  const deleted = await db
    .delete(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.id, contactId)))
    .returning({ id: contact.id });
  return deleted.length;
}

/** Art. 18 III, correction. Durable by accident of a good design elsewhere:
 *  findOrCreateContact returns an existing row UNTOUCHED, and no code path writes
 *  contact.name after creation, so a corrected name survives the member's next
 *  inbound message. Had that not been true the correction right would have been
 *  void within seconds of being exercised. */
export async function renameContact(
  churchId: string,
  contactId: string,
  name: string,
): Promise<number> {
  const updated = await db
    .update(contact)
    .set({ name })
    .where(and(eq(contact.churchId, churchId), eq(contact.id, contactId)))
    .returning({ id: contact.id });
  return updated.length;
}
```

Note: the unused `sql` import above must be removed if the linter objects — it is listed only because `keysetAfter`'s signature may need widening. Prefer removing it.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/member-data-repo.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Add the new functions to the two-church isolation attack list**

In `tests/repo-isolation.test.ts`, add to the import block near the other repo imports:

```ts
import {
  countMemberRows, deleteMember, loadMemberSubject, pageMessages, pagePrayers, renameContact,
} from '@/lib/repo/member-data';
```

And append this describe block at the end of the file:

```ts
describe('member-data repo tenant isolation', () => {
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
```

- [ ] **Step 6: Run the isolation suite**

```bash
npx vitest run tests/repo-isolation.test.ts
```

Expected: PASS, including the five new cross-church attacks.

- [ ] **Step 7: Commit**

```bash
git add src/lib/repo/member-data.ts tests/member-data-repo.test.ts tests/repo-isolation.test.ts
git commit -m "feat(lgpd): one member's data, scoped so another church's id is simply not found"
```

---

### Task 5: `repo/erasure.ts` — receipts that cannot be minted twice

**Files:**
- Create: `src/lib/repo/erasure.ts`
- Create: `tests/erasure-repo.test.ts`
- Modify: `tests/repo-isolation.test.ts`

**Interfaces:**
- Consumes: `@/db/schema` (`erasureRecord`), `@/lib/repo/member-data` types.
- Produces, from `@/lib/repo/erasure`:
  - `openSubjectErasure(input): Promise<{ id: string; createdAt: Date } | null>` — `null` means zero rows inserted, which is a **meaningful answer**, not a failure
  - `completeErasureRecord(recordId, churchId): Promise<void>` — status flip + `completed_at` only, **no counts parameter**
  - `findErasureByContact(churchId, contactId): Promise<ErasureRecordRow | null>`
  - `listErasureRecords(churchId, limit): Promise<ErasureRecordRow[]>`
  - `findErasureByPhoneHash(churchId, hash): Promise<ErasureRecordRow | null>`

**The load-bearing idea:** `openSubjectErasure` is **one statement with two guards** — an `INSERT … SELECT FROM contact WHERE id AND church_id` (so a receipt cannot be minted for a contact that is already gone) plus `ON CONFLICT … DO NOTHING` against the partial unique index (so a second receipt for the same contact is impossible). Both guards are inside one statement, so both are atomic under Postgres's per-statement implicit transaction. **No pre-check** — a pre-check is TOCTOU.

**Why `completeErasureRecord` takes no counts:** the cascade is invisible to any rowcount, so counts can only come from an observation taken *before* the delete. Writing them at open time is what lets the nightly sweep complete an interrupted erasure without inventing numbers it cannot obtain — the contact row it would have counted no longer exists.

- [ ] **Step 1: Write the failing test**

Create `tests/erasure-repo.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__erasureRepoClient = client;
  return { db: drizzle(client, { schema }) };
});

import {
  completeErasureRecord,
  findErasureByContact,
  findErasureByPhoneHash,
  listErasureRecords,
  openSubjectErasure,
} from '@/lib/repo/erasure';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
let client: PGlite;
let churchId: string;
let otherChurchId: string;
let contactId: string;

async function makeChurch(name: string): Promise<string> {
  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
       unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,'oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [name],
  );
  return c.rows[0].id;
}

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__erasureRepoClient as PGlite;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
  churchId = await makeChurch('Igreja Comprovante');
  otherChurchId = await makeChurch('Igreja Vizinha');
  const ct = await client.query<{ id: string }>(
    `insert into contact (church_id,phone,name) values ($1,'5511999998888','Maria') returning id`,
    [churchId],
  );
  contactId = ct.rows[0].id;
});

describe('openSubjectErasure', () => {
  it('mints a pending receipt carrying the PRE-DELETE counts', async () => {
    const rec = await openSubjectErasure({
      churchId, contactId, phoneHash: 'abc123', performedByEmail: 'secretaria@igreja.org',
      messages: 412, prayers: 3,
    });
    expect(rec).not.toBeNull();
    expect(rec!.id).toMatch(/^[0-9a-f-]{36}$/);

    const row = await findErasureByContact(churchId, contactId);
    expect(row!.status).toBe('pending');
    expect(row!.messagesDeleted).toBe(412);
    expect(row!.prayersDeleted).toBe(3);
    expect(row!.contactsDeleted).toBe(1);
    expect(row!.performedByEmail).toBe('secretaria@igreja.org');
  });

  it('returns null on a SECOND attempt for the same contact — the double-click', async () => {
    // Zero rows inserted is a meaningful answer, not a failure. The guard is the
    // partial unique index inside the statement, not an application pre-check
    // (which would be TOCTOU).
    const again = await openSubjectErasure({
      churchId, contactId, phoneHash: 'abc123', performedByEmail: 'outra@igreja.org',
      messages: 999, prayers: 999,
    });
    expect(again).toBeNull();

    const all = await listErasureRecords(churchId, 50);
    expect(all.filter((r) => r.subjectContactId === contactId)).toHaveLength(1);
    // And the loser did not overwrite the winner's numbers.
    expect(all.find((r) => r.subjectContactId === contactId)!.messagesDeleted).toBe(412);
  });

  it('returns null for a contact that does not exist — no phantom receipt', async () => {
    const rec = await openSubjectErasure({
      churchId, contactId: '00000000-0000-0000-0000-000000000000',
      phoneHash: null, performedByEmail: 'x@y.org', messages: 0, prayers: 0,
    });
    expect(rec).toBeNull();
  });

  it('returns null for another church\'s contact', async () => {
    // The INSERT … SELECT FROM contact WHERE id AND church_id is what makes this
    // impossible, rather than a check the caller has to remember.
    const rec = await openSubjectErasure({
      churchId: otherChurchId, contactId,
      phoneHash: null, performedByEmail: 'invasor@vizinha.org', messages: 0, prayers: 0,
    });
    expect(rec).toBeNull();
    expect(await findErasureByContact(otherChurchId, contactId)).toBeNull();
  });

  it('stores a null hash when the secret was absent, and still records', async () => {
    const ct = await client.query<{ id: string }>(
      `insert into contact (church_id,phone) values ($1,'5511777776666') returning id`, [churchId],
    );
    const rec = await openSubjectErasure({
      churchId, contactId: ct.rows[0].id, phoneHash: null,
      performedByEmail: 'secretaria@igreja.org', messages: 1, prayers: 0,
    });
    expect(rec).not.toBeNull();
    expect((await findErasureByContact(churchId, ct.rows[0].id))!.subjectPhoneHash).toBeNull();
  });
});

describe('completeErasureRecord', () => {
  it('flips status to done and stamps completed_at WITHOUT touching counts', async () => {
    // The counts were written at open time from a pre-delete observation. If
    // completion could write them, the sweep would have to invent numbers for a
    // contact row that no longer exists.
    const before = await findErasureByContact(churchId, contactId);
    await completeErasureRecord(before!.id, churchId);

    const after = await findErasureByContact(churchId, contactId);
    expect(after!.status).toBe('done');
    expect(after!.completedAt).not.toBeNull();
    expect(after!.messagesDeleted).toBe(412);
    expect(after!.prayersDeleted).toBe(3);
  });

  it('cannot complete another church\'s record', async () => {
    const rec = await findErasureByContact(churchId, contactId);
    await completeErasureRecord(rec!.id, otherChurchId);
    // Still whatever it already was; the wrong church changed nothing.
    expect((await findErasureByContact(churchId, contactId))!.status).toBe('done');
  });
});

describe('findErasureByPhoneHash', () => {
  it('finds the receipt for a hash within the church', async () => {
    const found = await findErasureByPhoneHash(churchId, 'abc123');
    expect(found).not.toBeNull();
    expect(found!.status).toBe('done');
  });

  it('does not find another church\'s receipt', async () => {
    expect(await findErasureByPhoneHash(otherChurchId, 'abc123')).toBeNull();
  });

  it('returns null for an unknown hash', async () => {
    expect(await findErasureByPhoneHash(churchId, 'nao-existe')).toBeNull();
  });
});

describe('listErasureRecords', () => {
  it('returns this church\'s records newest first', async () => {
    const rows = await listErasureRecords(churchId, 50);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(rows[i].createdAt.getTime());
    }
  });

  it('never returns another church\'s records', async () => {
    expect(await listErasureRecords(otherChurchId, 50)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/erasure-repo.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/repo/erasure"`.

- [ ] **Step 3: Write `src/lib/repo/erasure.ts`**

```ts
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { erasureRecord } from '@/db/schema';

/** The church's own view of its erasure receipts. Church-scoped; no query here
 *  spans churches. The vendor's cross-church view is a DIFFERENT function in the
 *  owner-only platform repo, with strictly fewer columns. */

export interface ErasureRecordRow {
  id: string;
  reason: 'subject_request' | 'retention';
  status: 'pending' | 'done';
  subjectContactId: string | null;
  subjectPhoneHash: string | null;
  performedByEmail: string | null;
  messagesDeleted: number;
  prayersDeleted: number;
  contactsDeleted: number;
  createdAt: Date;
  completedAt: Date | null;
}

const RECORD_COLUMNS = {
  id: erasureRecord.id,
  reason: erasureRecord.reason,
  status: erasureRecord.status,
  subjectContactId: erasureRecord.subjectContactId,
  subjectPhoneHash: erasureRecord.subjectPhoneHash,
  performedByEmail: erasureRecord.performedByEmail,
  messagesDeleted: erasureRecord.messagesDeleted,
  prayersDeleted: erasureRecord.prayersDeleted,
  contactsDeleted: erasureRecord.contactsDeleted,
  createdAt: erasureRecord.createdAt,
  completedAt: erasureRecord.completedAt,
};

export interface OpenSubjectErasureInput {
  churchId: string;
  contactId: string;
  phoneHash: string | null;
  performedByEmail: string;
  messages: number;
  prayers: number;
}

/** ONE statement, TWO guards, no pre-check.
 *
 *  Guard 1 — `SELECT … FROM contact WHERE c.id = $ AND c.church_id = $`: it is
 *  impossible to mint a receipt for a contact that is already gone, or for
 *  another church's contact. The insert simply selects zero rows.
 *
 *  Guard 2 — `ON CONFLICT … DO NOTHING` against the partial unique index
 *  erasure_record_subject_uq: it is impossible to mint a SECOND receipt for the
 *  same contact. A double-click's second run inserts nothing.
 *
 *  Both guards are inside one statement, so both are atomic under Postgres's
 *  per-statement implicit transaction — there is no window in which two receipts
 *  can exist. A pre-check ("does a record already exist?") would have been TOCTOU
 *  and is deliberately absent.
 *
 *  Returns null when zero rows were inserted. That is a MEANINGFUL ANSWER, not an
 *  error: the caller looks the existing record up and decides which of three
 *  things happened (already done / still pending / no such contact).
 *
 *  Raw SQL because drizzle cannot express INSERT … SELECT with a partial-index
 *  conflict target. Timestamps are absent here (all defaults), so the ISO-text
 *  convention in password-reset.ts does not apply. */
export async function openSubjectErasure(
  input: OpenSubjectErasureInput,
): Promise<{ id: string; createdAt: Date } | null> {
  const result = await db.execute(sql`
    insert into erasure_record
      (church_id, reason, status, subject_contact_id, subject_phone_hash,
       performed_by_email, messages_deleted, prayers_deleted, contacts_deleted)
    select ${input.churchId}::uuid, 'subject_request', 'pending', c.id, ${input.phoneHash},
           ${input.performedByEmail}, ${input.messages}, ${input.prayers}, 1
      from contact c
     where c.id = ${input.contactId}::uuid and c.church_id = ${input.churchId}::uuid
    on conflict ("church_id", "subject_contact_id") where reason = 'subject_request'
    do nothing
    returning id, created_at
  `);

  // Both drivers return { rows: [...] }; the shapes differ in everything else.
  const rows = (result as unknown as { rows: Array<{ id: string; created_at: string | Date }> }).rows;
  if (rows.length === 0) return null;
  return { id: rows[0].id, createdAt: new Date(rows[0].created_at) };
}

/** A STATUS FLIP ONLY. Deliberately takes no counts.
 *
 *  The counts have been on the row since it was opened, taken from an observation
 *  immediately before the delete — the only moment they were obtainable, because
 *  a cascade appears in no rowcount. Letting completion write them would mean the
 *  nightly sweep had to invent numbers for a contact row that no longer exists,
 *  and a self-healed receipt reading "0 mensagens, 0 pedidos" for the one case
 *  where the delete definitely happened is worse than no receipt at all. */
export async function completeErasureRecord(recordId: string, churchId: string): Promise<void> {
  await db
    .update(erasureRecord)
    .set({ status: 'done', completedAt: new Date() })
    .where(and(eq(erasureRecord.id, recordId), eq(erasureRecord.churchId, churchId)));
}

export async function findErasureByContact(
  churchId: string,
  contactId: string,
): Promise<ErasureRecordRow | null> {
  const rows = await db
    .select(RECORD_COLUMNS)
    .from(erasureRecord)
    .where(and(
      eq(erasureRecord.churchId, churchId),
      eq(erasureRecord.subjectContactId, contactId),
      eq(erasureRecord.reason, 'subject_request'),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function findErasureByPhoneHash(
  churchId: string,
  hash: string,
): Promise<ErasureRecordRow | null> {
  const rows = await db
    .select(RECORD_COLUMNS)
    .from(erasureRecord)
    .where(and(eq(erasureRecord.churchId, churchId), eq(erasureRecord.subjectPhoneHash, hash)))
    .orderBy(desc(erasureRecord.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listErasureRecords(
  churchId: string,
  limit: number,
): Promise<ErasureRecordRow[]> {
  return db
    .select(RECORD_COLUMNS)
    .from(erasureRecord)
    .where(eq(erasureRecord.churchId, churchId))
    .orderBy(desc(erasureRecord.createdAt))
    .limit(limit);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/erasure-repo.test.ts
```

Expected: PASS, 12 tests. If `returns null on a SECOND attempt` fails, the partial unique index lost its predicate — re-check Task 1 Step 6.

- [ ] **Step 5: Add the erasure repo to the isolation attack list**

In `tests/repo-isolation.test.ts`, add to the imports:

```ts
import { findErasureByContact, listErasureRecords } from '@/lib/repo/erasure';
```

And append:

```ts
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
```

- [ ] **Step 6: Run the suite**

```bash
npx vitest run tests/repo-isolation.test.ts tests/erasure-repo.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/repo/erasure.ts tests/erasure-repo.test.ts tests/repo-isolation.test.ts
git commit -m "feat(lgpd): a receipt Postgres will not mint twice, and never for a phantom"
```

---

### Task 6: The two data-rights session guards

**Files:**
- Modify: `src/lib/auth/writable.ts`
- Create: `tests/data-rights-guards.test.ts`

**Interfaces:**
- Consumes: `@/lib/auth/session`, `@/lib/repo/admin`.
- Produces, from `@/lib/auth/writable`:
  - `requireDataRightsSession(): Promise<AdminIdentity | { blocked: 'revoked' }>` — for Server Actions
  - `checkDataRightsSession(): Promise<AdminIdentity | { blocked: 'unauthenticated' | 'revoked' }>` — for Route Handlers

**The refactor, precisely.** `verifyWritable` currently does three things: identity re-check, password-epoch re-check, and the suspension test — and the suspension test needs `getChurchById`, an extra query. Extracting a shared helper that included that call would silently add a church-existence redirect and one extra query to **every protected page load**. So the extraction is narrower than it looks:

```
verifyIdentity(session)      → findAdminById + church match + password epoch. Nothing else.
requireReadableSession()     = verifyIdentity + redirect('/admin/login') on failure   [unchanged behaviour]
requireDataRightsSession()   = verifyIdentity + sentinel on failure                   [NEW]
checkDataRightsSession()     = getSession/isAuthenticated + verifyIdentity            [NEW]
requireWritableSession()     = verifyIdentity + getChurchById + effectiveStatus       [unchanged behaviour]
checkWritableSession()       = as today                                               [unchanged behaviour]
```

**`getChurchById` stays in the writable path only. No read page gains a query or a redirect.**

**Why these guards skip the suspension check** — and this reasoning must survive into the code, because an implementer who does not understand it is one refactor away from routing the delete path through `requireWritableSession`:

1. Erasure confers no product value on the church — it is pure cost, so there is no incentive gradient to exploit and suspension is not evading anything.
2. The church is the *controlador*; Rafael is the *operador*. Withholding a controller's delete button over a billing dispute is the operator asserting control over the controller's data.
3. Art. 18 VI plus Art. 19 II's 15-day deadline run against **the church**, and the fine lands on the church. A vendor's invoice must not be the mechanism by which a controller misses a statutory deadline.
4. Revocation is still checked, so a *removed* secretary is blocked exactly as today.

**Erasure is the one write a suspended church can perform.** Everything else — replying to a member, editing bot content, credentials, staff — still routes through `requireWritableSession` and is still blocked.

- [ ] **Step 1: Write the failing guard test**

Create `tests/data-rights-guards.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findAdminById = vi.fn();
const getChurchById = vi.fn();
const getSession = vi.fn();
const requireSession = vi.fn();

vi.mock('@/lib/repo/admin', () => ({ findAdminById }));
vi.mock('@/lib/repo/church-admin', () => ({ getChurchById }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session');
  return { ...actual, getSession, requireSession };
});

import { checkDataRightsSession, requireDataRightsSession } from '@/lib/auth/writable';

const PWD_AT = new Date('2026-01-01T00:00:00.000Z');
const SESSION = {
  adminUserId: 'admin-1', churchId: 'church-1', name: 'Secretária', pwdAt: PWD_AT.getTime(),
};
const ADMIN = { id: 'admin-1', churchId: 'church-1', passwordChangedAt: PWD_AT };

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(SESSION);
  getSession.mockResolvedValue({ ...SESSION, isLoggedIn: true, kind: 'admin' });
  findAdminById.mockResolvedValue(ADMIN);
});

afterEach(() => { vi.restoreAllMocks(); });

describe('requireDataRightsSession', () => {
  it('returns the identity for a current secretary', async () => {
    const result = await requireDataRightsSession();
    expect(result).toEqual({ adminUserId: 'admin-1', churchId: 'church-1', name: 'Secretária' });
  });

  it('NEVER calls getChurchById — suspension is deliberately not checked', async () => {
    // This is the assertion that encodes the decision. An Art. 18 deadline does
    // not pause for a billing dispute between the vendor and the church, and the
    // fine lands on the church, not on the vendor. If a later refactor routes this
    // through requireWritableSession, this test is what fails.
    await requireDataRightsSession();
    expect(getChurchById).not.toHaveBeenCalled();
  });

  it('blocks a removed secretary — revocation IS still checked', async () => {
    findAdminById.mockResolvedValue(undefined);
    expect(await requireDataRightsSession()).toEqual({ blocked: 'revoked' });
  });

  it('blocks a secretary whose row now belongs to another church', async () => {
    findAdminById.mockResolvedValue({ ...ADMIN, churchId: 'church-2' });
    expect(await requireDataRightsSession()).toEqual({ blocked: 'revoked' });
  });

  it('blocks a cookie sealed before a password change', async () => {
    findAdminById.mockResolvedValue({ ...ADMIN, passwordChangedAt: new Date('2026-06-01T00:00:00Z') });
    expect(await requireDataRightsSession()).toEqual({ blocked: 'revoked' });
  });

  it('does not strip pwdAt into the returned identity', async () => {
    const result = await requireDataRightsSession();
    expect('pwdAt' in (result as Record<string, unknown>)).toBe(false);
  });
});

describe('checkDataRightsSession', () => {
  it('returns a sentinel rather than redirecting when there is no session', async () => {
    // A route handler that let NEXT_REDIRECT escape would serialise a framework
    // control-flow signal into its own JSON body — a bug already fixed once in
    // src/app/api/blob/upload/route.ts.
    getSession.mockResolvedValue({ isLoggedIn: false });
    expect(await checkDataRightsSession()).toEqual({ blocked: 'unauthenticated' });
  });

  it('returns the identity for a current secretary', async () => {
    expect(await checkDataRightsSession()).toEqual({
      adminUserId: 'admin-1', churchId: 'church-1', name: 'Secretária',
    });
  });

  it('blocks a removed secretary', async () => {
    findAdminById.mockResolvedValue(undefined);
    expect(await checkDataRightsSession()).toEqual({ blocked: 'revoked' });
  });

  it('NEVER calls getChurchById', async () => {
    await checkDataRightsSession();
    expect(getChurchById).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/data-rights-guards.test.ts
```

Expected: FAIL — `checkDataRightsSession is not a function`.

- [ ] **Step 3: Extract `verifyIdentity` and add the two guards**

In `src/lib/auth/writable.ts`, insert this **above** the existing `verifyWritable`:

```ts
/** Checks 1 and 2 of the three below, and NOT check 3.
 *
 *  Extracted so the data-rights guards share exactly the identity re-checks and
 *  nothing else. Deliberately does NOT call getChurchById: that query exists only
 *  to supply `status`/`graceUntil` for the suspension test, and folding it in here
 *  would add a church-existence redirect and one extra query to every protected
 *  page load. */
async function verifyIdentity(
  session: SessionClaims,
): Promise<AdminIdentity | { blocked: 'revoked' }> {
  const admin = await findAdminById(session.adminUserId);
  if (!admin || admin.churchId !== session.churchId) return { blocked: 'revoked' };
  if (!sessionMatchesPassword(session, admin.passwordChangedAt)) return { blocked: 'revoked' };
  return identityOf(session);
}
```

Then rewrite `verifyWritable`'s first half to use it, leaving its behaviour identical:

```ts
async function verifyWritable(
  session: SessionClaims,
): Promise<AdminIdentity | { blocked: 'suspended' | 'revoked' }> {
  const identity = await verifyIdentity(session);
  if ('blocked' in identity) return identity;

  // getChurchById lives ONLY on this path. Its existence check is near-redundant —
  // admin_user.church_id is ON DELETE CASCADE, so a deleted church takes its admin
  // rows with it and findAdminById already returned undefined — but its real job is
  // supplying status and graceUntil, which only the suspension test needs.
  const church = await getChurchById(session.churchId);
  if (!church) return { blocked: 'revoked' };

  if (effectiveStatus(church.status, church.graceUntil, new Date()) === 'suspended') {
    return { blocked: 'suspended' };
  }

  return identity;
}
```

Now append the two new guards after `requireReadableSession`:

```ts
/** THE DATA-RIGHTS GUARDS — the only guards in this file that deliberately skip
 *  the suspension check.
 *
 *  Erasure is the ONE WRITE a suspended church can perform. Export beside it is a
 *  read and grants no new reading power, since requireReadableSession already lets
 *  a suspended church read every message.
 *
 *  Why deletion is exempt, argued on its own terms — this comment exists because
 *  an implementer who does not understand it is one refactor away from routing
 *  the delete path through requireWritableSession and quietly breaking a statutory
 *  obligation:
 *
 *   1. It cannot be used to evade what suspension is FOR. Suspension stops the
 *      product — sending WhatsApp messages, editing bot content — so a non-payer
 *      cannot keep serving members for free. Erasing a member confers no product
 *      value on the church; it is pure cost. There is no incentive to exploit.
 *   2. The controller is deleting the controller's own data. The church is the
 *      *controlador*; we are the *operador*. Withholding a controller's delete
 *      button over a billing dispute is the operator asserting control over the
 *      controller's data — the wrong role in the wrong direction.
 *   3. The deadline runs against the church. Art. 18 VI plus Art. 19 II's 15 days,
 *      and the fine lands on the church. A vendor's invoice must never be the
 *      mechanism by which a controller misses a statutory deadline.
 *   4. Revocation is STILL checked, so a removed secretary is blocked exactly as
 *      today; a current secretary of a suspended church is still the controller's
 *      agent. Blast radius is one member, behind a typed APAGAR confirmation.
 *
 *  The honest residual — a church in a billing dispute can destroy its own member
 *  data — is true on every day the church is NOT suspended too, so suspension was
 *  never the control preventing it. The control that replaces it is visibility:
 *  every erasure is readable by the vendor in /owner. See listErasureSignals.
 *
 *  EXACTLY THREE FILES may call these. tests/privilege-boundary.test.ts asserts
 *  that set, so a fourth caller fails the suite rather than passing review. */
export async function requireDataRightsSession(): Promise<
  AdminIdentity | { blocked: 'revoked' }
> {
  const session = await requireSession();
  return verifyIdentity(session);
}

/** The route-handler variant. "No session" is a returnable sentinel instead of a
 *  redirect(), for the same reason checkWritableSession is: a route that let
 *  NEXT_REDIRECT escape would serialise a framework control-flow signal into its
 *  own JSON error body. */
export async function checkDataRightsSession(): Promise<
  AdminIdentity | { blocked: 'unauthenticated' | 'revoked' }
> {
  const session = await getSession();
  if (!isAuthenticated(session) || !session.churchId) return { blocked: 'unauthenticated' };
  return verifyIdentity({
    adminUserId: session.adminUserId!,
    churchId: session.churchId!,
    name: session.name ?? '',
    pwdAt: session.pwdAt,
  });
}
```

- [ ] **Step 4: Run the guard test and the existing session-guard suite**

```bash
npx vitest run tests/data-rights-guards.test.ts tests/session-guards.test.ts
```

Expected: PASS. `session-guards.test.ts` passing unchanged is the evidence that the `verifyWritable` refactor altered no existing behaviour.

- [ ] **Step 5: Run the full suite**

```bash
npx vitest run --maxWorkers=4
```

Expected: all green. `writable.ts` is imported by every admin write action, so a regression here is broad.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/writable.ts tests/data-rights-guards.test.ts
git commit -m "feat(lgpd): a billing dispute must not be why a church misses a legal deadline"
```

---

### Task 7: `repo/retention.ts` — the cross-church purge

**Files:**
- Create: `src/lib/repo/retention.ts`
- Create: `tests/retention-purge.test.ts`

**Interfaces:**
- Consumes: `@/db/schema`, `@/lib/retention` (`retentionCutoff`).
- Produces, from `@/lib/repo/retention`:
  - `listChurchIdsForPurge(limit): Promise<string[]>` — least-recently-purged first
  - `markChurchPurged(churchId, at): Promise<void>`
  - `hasPurgeWork(churchId, cutoff): Promise<boolean>`
  - `openRetentionRecord(churchId): Promise<string>` — the record id
  - `addRetentionCounts(recordId, churchId, delta: PurgeDelta): Promise<void>`
  - `purgeMessageBatch(churchId, cutoff, limit): Promise<number>`
  - `purgePrayerBatch(churchId, cutoff, limit): Promise<number>`
  - `purgeContactBatch(churchId, cutoff, limit): Promise<number>`
  - `completeErasureRecordSystem(recordId): Promise<void>`
  - `sweepStaleRetentionRecords(olderThan): Promise<number>`
  - `listStalePendingErasures(olderThan): Promise<StalePendingErasure[]>`
  - `export interface PurgeDelta { messages: number; prayers: number; contacts: number }`
  - `export interface StalePendingErasure { id: string; churchId: string; subjectContactId: string | null }`

**⚠ THIS MODULE IS SYSTEM-ONLY.** Every query here spans churches by construction. It may be imported by **exactly one file**: `src/app/api/cron/purge/route.ts`. Task 8 makes that a test. Do not import it from anywhere else, and do not import `platform.ts` **into** it.

**The counting model — read this before writing any SQL.** `DELETE … RETURNING` returns only *directly* deleted rows; rows removed by an `ON DELETE CASCADE` appear in no rowcount and no `RETURNING` set. So the order of operations *is* the correctness of the receipt:

- **Children first** — messages and prayers, both those past the cutoff *and* those belonging to a contact that is about to be purged.
- **Guarded parent last** — contacts are deleted only under a `NOT EXISTS` pair proving they own zero child rows, so **a cascade can never fire during the purge.**

The naive ordering (idle contacts first, let the cascade take their children) understates by exactly the volume the purge worked hardest on: three idle contacts holding 900 messages plus 340 messages of active members get reported as "340 mensagens". This is not "count more carefully" — it is "make the uncountable case impossible".

**`m.church_id = $1` inside the `NOT EXISTS` is load-bearing.** Without it the guard is still *correct* (contact_id is a UUID primary key, so another church's row can never match) but no longer *seekable*: `message_contact_keyset_idx` leads with `church_id`, and a predicate constraining only the second column cannot be used as an index seek. Church-scoping the guard costs nothing semantically and is the only reason the index exists.

- [ ] **Step 1: Write the failing purge test**

Create `tests/retention-purge.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__retentionClient = client;
  return { db: drizzle(client, { schema }) };
});

import {
  addRetentionCounts,
  completeErasureRecordSystem,
  hasPurgeWork,
  listChurchIdsForPurge,
  listStalePendingErasures,
  markChurchPurged,
  openRetentionRecord,
  purgeContactBatch,
  purgeMessageBatch,
  purgePrayerBatch,
  sweepStaleRetentionRecords,
} from '@/lib/repo/retention';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
const NOW = new Date('2026-08-11T06:00:00.000Z');
const CUTOFF = new Date('2025-08-11T06:00:00.000Z');   // NOW - 365d
const OLD = '2025-01-01T00:00:00Z';                    // past the cutoff
const RECENT = '2026-08-01T00:00:00Z';                 // inside retention

let client: PGlite;

async function migrate(): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
}

async function makeChurch(name: string): Promise<string> {
  const c = await client.query<{ id: string }>(
    `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
       unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,'oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`, [name],
  );
  return c.rows[0].id;
}

async function makeContact(churchId: string, phone: string, lastInbound: string | null): Promise<string> {
  const ct = await client.query<{ id: string }>(
    `insert into contact (church_id,phone,last_inbound_at,created_at) values ($1,$2,$3,$4) returning id`,
    [churchId, phone, lastInbound, lastInbound ?? OLD],
  );
  return ct.rows[0].id;
}

async function addMessages(churchId: string, contactId: string, n: number, at: string): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await client.query(
      `insert into message (church_id,contact_id,direction,body,created_at) values ($1,$2,'inbound',$3,$4)`,
      [churchId, contactId, `msg ${i}`, at],
    );
  }
}

async function countRows(table: string, churchId: string): Promise<number> {
  const r = await client.query<{ n: string }>(
    `select count(*) as n from ${table} where church_id = $1`, [churchId],
  );
  return Number(r.rows[0].n);
}

beforeEach(async () => {
  client = (globalThis as Record<string, unknown>).__retentionClient as PGlite;
  // Fresh schema per test: the purge is destructive and order-dependent.
  await client.exec(`drop schema public cascade; create schema public;`);
  await client.exec(`drop schema if exists drizzle cascade;`);
  await migrate();
});

describe('the counting model', () => {
  it('reports EVERY deleted row — a cascade never fires during a purge', async () => {
    // The regression this whole ordering exists for. Three idle contacts holding
    // 900 messages, plus 340 old messages belonging to still-active members. The
    // naive ordering (contacts first, cascade takes the rest) reports 340.
    const churchId = await makeChurch('Igreja Contagem');

    for (let i = 0; i < 3; i += 1) {
      const idle = await makeContact(churchId, `55110000000${i}`, OLD);
      await addMessages(churchId, idle, 300, OLD);
    }
    const active = await makeContact(churchId, '5511999999999', RECENT);
    await addMessages(churchId, active, 340, OLD);

    let messages = 0;
    let contacts = 0;
    let batch = 0;
    do {
      batch = await purgeMessageBatch(churchId, CUTOFF, 500);
      messages += batch;
    } while (batch === 500);
    do {
      batch = await purgeContactBatch(churchId, CUTOFF, 500);
      contacts += batch;
    } while (batch === 500);

    expect(messages).toBe(1240);
    expect(contacts).toBe(3);
    // The active member survives, having had all their old messages removed.
    expect(await countRows('contact', churchId)).toBe(1);
    expect(await countRows('message', churchId)).toBe(0);
  });

  it('a contact that still owns a message is NOT deleted — the NOT EXISTS guard', async () => {
    // The mid-purge race: the webhook inserts a message one statement before it
    // touches last_inbound_at, so an idle contact can acquire a child between the
    // child sweep and the parent sweep. It must survive to the next run rather
    // than have the new message silently cascaded away.
    const churchId = await makeChurch('Igreja Corrida');
    const idle = await makeContact(churchId, '5511000000000', OLD);
    await addMessages(churchId, idle, 1, RECENT);   // arrived just now

    expect(await purgeContactBatch(churchId, CUTOFF, 500)).toBe(0);
    expect(await countRows('contact', churchId)).toBe(1);
    expect(await countRows('message', churchId)).toBe(1);
  });

  it('purges prayer requests on the same clock as messages — no exemption', async () => {
    // Settled by the owner: the argument for keeping prayers longest is the same
    // argument for keeping them least. They carry health, family and faith detail.
    const churchId = await makeChurch('Igreja Oração');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    await client.query(
      `insert into prayer_request (church_id,contact_id,text,created_at) values
        ($1,$2,'antiga',$3), ($1,$2,'recente',$4)`,
      [churchId, ct, OLD, RECENT],
    );
    expect(await purgePrayerBatch(churchId, CUTOFF, 500)).toBe(1);
    expect(await countRows('prayer_request', churchId)).toBe(1);
  });

  it('leaves the church row, its texts and its menu untouched', async () => {
    const churchId = await makeChurch('Igreja Preservada');
    await client.query(
      `insert into menu_item (church_id,position,label,body_text) values ($1,1,'Horários','corpo')`,
      [churchId],
    );
    const idle = await makeContact(churchId, '5511000000000', OLD);
    await addMessages(churchId, idle, 5, OLD);

    await purgeMessageBatch(churchId, CUTOFF, 500);
    await purgeContactBatch(churchId, CUTOFF, 500);

    expect(await countRows('menu_item', churchId)).toBe(1);
    const ch = await client.query<{ name: string }>(`select name from church where id = $1`, [churchId]);
    expect(ch.rows[0].name).toBe('Igreja Preservada');
  });
});

describe('isolation and convergence', () => {
  it('never touches another church, and a second run deletes nothing', async () => {
    const a = await makeChurch('Igreja A');
    const b = await makeChurch('Igreja B');
    for (const id of [a, b]) {
      const ct = await makeContact(id, `5511${id.slice(0, 6)}`, OLD);
      await addMessages(id, ct, 10, OLD);
    }

    await purgeMessageBatch(a, CUTOFF, 500);
    await purgeContactBatch(a, CUTOFF, 500);

    expect(await countRows('message', a)).toBe(0);
    expect(await countRows('message', b)).toBe(10);
    expect(await countRows('contact', b)).toBe(1);

    // Idempotent: the predicate is absolute time, not a cursor.
    expect(await purgeMessageBatch(a, CUTOFF, 500)).toBe(0);
    expect(await purgeContactBatch(a, CUTOFF, 500)).toBe(0);
  });

  it('converges with a batch limit of 1', async () => {
    const churchId = await makeChurch('Igreja Lenta');
    const ct = await makeContact(churchId, '5511000000000', OLD);
    await addMessages(churchId, ct, 5, OLD);

    let guard = 0;
    while (await purgeMessageBatch(churchId, CUTOFF, 1)) { guard += 1; expect(guard).toBeLessThan(50); }
    expect(await countRows('message', churchId)).toBe(0);
  });

  it('ages out a contact whose last_inbound_at is NULL, via created_at', async () => {
    // last_inbound_at is written by a SEPARATE statement from the contact insert,
    // and neon-http has no transactions — so a real row can legitimately have a
    // null here. Coalescing to created_at (NOT NULL) means it still ages out
    // instead of living forever.
    const churchId = await makeChurch('Igreja Nula');
    await makeContact(churchId, '5511000000000', null);
    expect(await purgeContactBatch(churchId, CUTOFF, 500)).toBe(1);
  });
});

describe('hasPurgeWork', () => {
  it('is false for a church with nothing past the cutoff', async () => {
    const churchId = await makeChurch('Igreja Nova');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    await addMessages(churchId, ct, 3, RECENT);
    expect(await hasPurgeWork(churchId, CUTOFF)).toBe(false);
  });

  it('is true when any of the three has work', async () => {
    const churchId = await makeChurch('Igreja Com Trabalho');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    await addMessages(churchId, ct, 1, OLD);
    expect(await hasPurgeWork(churchId, CUTOFF)).toBe(true);
  });
});

describe('fairness across churches', () => {
  it('orders least-recently-purged first, with never-purged at the front', async () => {
    const never = await makeChurch('Nunca');
    const old = await makeChurch('Antiga');
    const recent = await makeChurch('Recente');
    await markChurchPurged(old, new Date('2026-08-01T06:00:00Z'));
    await markChurchPurged(recent, new Date('2026-08-10T06:00:00Z'));

    expect(await listChurchIdsForPurge(10)).toEqual([never, old, recent]);
  });

  it('advances the cursor even for a church whose slice was cut short', async () => {
    // This is what makes the rotation a rotation. A church with a million rows
    // takes its slice, moves to the back of the queue, and the rest of the
    // platform gets purged tomorrow instead of never.
    const a = await makeChurch('Grande');
    const b = await makeChurch('Pequena');
    expect(await listChurchIdsForPurge(10)).toEqual([a, b]);

    await markChurchPurged(a, NOW);
    expect(await listChurchIdsForPurge(10)).toEqual([b, a]);
  });
});

describe('the retention receipt', () => {
  it('opens pending at 0/0/0 and accumulates per batch', async () => {
    const churchId = await makeChurch('Igreja Recibo');
    const recordId = await openRetentionRecord(churchId);

    const opened = await client.query<{ status: string; messages_deleted: number }>(
      `select status, messages_deleted from erasure_record where id = $1`, [recordId],
    );
    expect(opened.rows[0].status).toBe('pending');
    expect(Number(opened.rows[0].messages_deleted)).toBe(0);

    await addRetentionCounts(recordId, churchId, { messages: 500, prayers: 0, contacts: 0 });
    await addRetentionCounts(recordId, churchId, { messages: 240, prayers: 12, contacts: 3 });

    const after = await client.query<{ messages_deleted: number; prayers_deleted: number; contacts_deleted: number }>(
      `select messages_deleted, prayers_deleted, contacts_deleted from erasure_record where id = $1`,
      [recordId],
    );
    // All THREE counters accumulate. An earlier draft incremented messages alone,
    // which would have left every receipt reading "0 pedidos, 0 cadastros" forever
    // and fired the interrupted-run string on runs that completed normally.
    expect(Number(after.rows[0].messages_deleted)).toBe(740);
    expect(Number(after.rows[0].prayers_deleted)).toBe(12);
    expect(Number(after.rows[0].contacts_deleted)).toBe(3);
  });

  it('addRetentionCounts cannot touch another church\'s record', async () => {
    const a = await makeChurch('A');
    const b = await makeChurch('B');
    const recordId = await openRetentionRecord(a);
    await addRetentionCounts(recordId, b, { messages: 999, prayers: 0, contacts: 0 });
    const row = await client.query<{ messages_deleted: number }>(
      `select messages_deleted from erasure_record where id = $1`, [recordId],
    );
    expect(Number(row.rows[0].messages_deleted)).toBe(0);
  });
});

describe('the sweeps', () => {
  it('flips a stale pending retention row to done, keeping its counts as they stand', async () => {
    // The killed-between-DELETE-and-UPDATE case. The receipt may read 0/0/0 even
    // though 500 bodies are gone. The sweep freezes it; it never invents a number.
    const churchId = await makeChurch('Igreja Interrompida');
    const recordId = await openRetentionRecord(churchId);
    await client.query(
      `update erasure_record set created_at = $2 where id = $1`,
      [recordId, '2026-08-10T00:00:00Z'],
    );

    expect(await sweepStaleRetentionRecords(new Date('2026-08-11T00:00:00Z'))).toBe(1);
    const row = await client.query<{ status: string; messages_deleted: number; completed_at: Date | null }>(
      `select status, messages_deleted, completed_at from erasure_record where id = $1`, [recordId],
    );
    expect(row.rows[0].status).toBe('done');
    expect(Number(row.rows[0].messages_deleted)).toBe(0);
    expect(row.rows[0].completed_at).not.toBeNull();
  });

  it('does not sweep a retention row that is still fresh', async () => {
    const churchId = await makeChurch('Igreja Fresca');
    await openRetentionRecord(churchId);
    expect(await sweepStaleRetentionRecords(new Date('2020-01-01T00:00:00Z'))).toBe(0);
  });

  it('lists stale pending SUBJECT erasures for the cron to finish', async () => {
    const churchId = await makeChurch('Igreja Pendente');
    const ct = await makeContact(churchId, '5511000000000', RECENT);
    const rec = await client.query<{ id: string }>(
      `insert into erasure_record (church_id,reason,status,subject_contact_id,created_at,messages_deleted)
       values ($1,'subject_request','pending',$2,'2026-08-10T00:00:00Z',7) returning id`,
      [churchId, ct],
    );

    const stale = await listStalePendingErasures(new Date('2026-08-11T00:00:00Z'));
    expect(stale).toHaveLength(1);
    expect(stale[0]).toEqual({ id: rec.rows[0].id, churchId, subjectContactId: ct });

    await completeErasureRecordSystem(rec.rows[0].id);
    const row = await client.query<{ status: string; messages_deleted: number }>(
      `select status, messages_deleted from erasure_record where id = $1`, [rec.rows[0].id],
    );
    expect(row.rows[0].status).toBe('done');
    // The self-healed receipt keeps its REAL counts, because they were written at
    // open time. A swept record reading 0 mensagens for the one case where the
    // delete definitely happened would be worse than no receipt.
    expect(Number(row.rows[0].messages_deleted)).toBe(7);
  });

  it('does not list retention rows as stale erasures, or vice versa', async () => {
    const churchId = await makeChurch('Igreja Mista');
    await client.query(
      `insert into erasure_record (church_id,reason,status,created_at)
       values ($1,'retention','pending','2026-08-10T00:00:00Z')`, [churchId],
    );
    expect(await listStalePendingErasures(new Date('2026-08-11T00:00:00Z'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/retention-purge.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/repo/retention"`.

- [ ] **Step 3: Write `src/lib/repo/retention.ts`**

```ts
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { church, erasureRecord } from '@/db/schema';

/** ⚠ SYSTEM-ONLY, CROSS-CHURCH BY CONSTRUCTION. ⚠
 *
 *  Every query in this file deliberately spans churches — that is its
 *  specification, not a defect. It exists so the nightly retention purge can walk
 *  the whole platform, which no church-facing code has any business doing.
 *
 *  IMPORTABLE BY EXACTLY ONE FILE: src/app/api/cron/purge/route.ts.
 *  tests/privilege-boundary.test.ts enforces that as an importer-keyed rule, and
 *  this module is itself SCANNED — so it may not import platform.ts either. If you
 *  need one of these functions somewhere else, you almost certainly want a
 *  church-scoped equivalent in repo/member-data.ts instead.
 *
 *  Timestamps in raw SQL go as ISO text with an explicit ::timestamptz cast, so a
 *  statement means the same thing on neon-http and on the PGlite the tests run
 *  against, rather than depending on how each driver encodes a Date. Same
 *  convention as src/lib/repo/password-reset.ts. */

/** Least-recently-purged first, never-purged at the front.
 *
 *  This ordering plus a per-church slice cap is the whole fairness mechanism.
 *  With an unordered list and a flat global budget, the tail of a 40-church list
 *  could go weeks unpurged with nothing in the product saying so. */
export async function listChurchIdsForPurge(limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: church.id })
    .from(church)
    .orderBy(sql`${church.retentionPurgedAt} asc nulls first`, asc(church.id))
    .limit(limit);
  return rows.map((r) => r.id);
}

/** Advanced when a church's slice ENDS, whether or not that church finished. That
 *  is what makes the rotation a rotation: a church with a million rows takes its
 *  slice, moves to the back of the queue, and the rest of the platform gets
 *  purged tomorrow instead of never. */
export async function markChurchPurged(churchId: string, at: Date): Promise<void> {
  await db.update(church).set({ retentionPurgedAt: at }).where(eq(church.id, churchId));
}

/** One statement, one round trip: does this church have anything to purge at all?
 *
 *  False → advance the cursor, write NO record, move on. This is what keeps "a
 *  retention row means something was actually deleted" true while still writing
 *  the row BEFORE the deletes. */
export async function hasPurgeWork(churchId: string, cutoff: Date): Promise<boolean> {
  const iso = cutoff.toISOString();
  const result = await db.execute(sql`
    select
      exists(select 1 from message         where church_id = ${churchId}::uuid and created_at < ${iso}::timestamptz)
      or exists(select 1 from prayer_request where church_id = ${churchId}::uuid and created_at < ${iso}::timestamptz)
      or exists(select 1 from contact        where church_id = ${churchId}::uuid
                 and coalesce(last_inbound_at, created_at) < ${iso}::timestamptz) as work
  `);
  const rows = (result as unknown as { rows: Array<{ work: boolean }> }).rows;
  return rows[0]?.work === true;
}

export async function openRetentionRecord(churchId: string): Promise<string> {
  const [row] = await db
    .insert(erasureRecord)
    .values({ churchId, reason: 'retention', status: 'pending' })
    .returning({ id: erasureRecord.id });
  return row.id;
}

export interface PurgeDelta {
  messages: number;
  prayers: number;
  contacts: number;
}

/** Names ALL THREE counters. Loops 1–3 delete messages, prayer requests AND
 *  contacts; an implementation incrementing messages alone would leave every
 *  receipt reading "0 pedidos de oração, 0 cadastros apagados" forever and fire
 *  the interrupted-run string on runs that completed normally. A batch that
 *  deleted only messages passes 0 for the other two. */
export async function addRetentionCounts(
  recordId: string,
  churchId: string,
  delta: PurgeDelta,
): Promise<void> {
  await db
    .update(erasureRecord)
    .set({
      messagesDeleted: sql`${erasureRecord.messagesDeleted} + ${delta.messages}`,
      prayersDeleted: sql`${erasureRecord.prayersDeleted} + ${delta.prayers}`,
      contactsDeleted: sql`${erasureRecord.contactsDeleted} + ${delta.contacts}`,
    })
    .where(and(eq(erasureRecord.id, recordId), eq(erasureRecord.churchId, churchId)));
}

/** STEP 1 — messages. Everything past the cutoff, PLUS everything belonging to a
 *  contact that is about to be purged. The second arm is what stops those rows
 *  from being taken invisibly by a cascade in step 3. */
export async function purgeMessageBatch(
  churchId: string,
  cutoff: Date,
  limit: number,
): Promise<number> {
  const iso = cutoff.toISOString();
  const result = await db.execute(sql`
    delete from message
     where id in (
       select id from message
        where church_id = ${churchId}::uuid
          and (created_at < ${iso}::timestamptz
               or contact_id in (select id from contact
                                  where church_id = ${churchId}::uuid
                                    and coalesce(last_inbound_at, created_at) < ${iso}::timestamptz))
        limit ${limit})
    returning id
  `);
  return (result as unknown as { rows: unknown[] }).rows.length;
}

/** STEP 2 — prayer requests. Same shape, same predicate pair. No exemption: the
 *  argument for keeping the most sensitive column longest is the same argument
 *  for keeping it least. */
export async function purgePrayerBatch(
  churchId: string,
  cutoff: Date,
  limit: number,
): Promise<number> {
  const iso = cutoff.toISOString();
  const result = await db.execute(sql`
    delete from prayer_request
     where id in (
       select id from prayer_request
        where church_id = ${churchId}::uuid
          and (created_at < ${iso}::timestamptz
               or contact_id in (select id from contact
                                  where church_id = ${churchId}::uuid
                                    and coalesce(last_inbound_at, created_at) < ${iso}::timestamptz))
        limit ${limit})
    returning id
  `);
  return (result as unknown as { rows: unknown[] }).rows.length;
}

/** STEP 3 — contacts, and ONLY those that provably own nothing.
 *
 *  The NOT EXISTS pair turns "the cascade *should* have nothing left" into "the
 *  cascade *cannot* fire". A member who writes between step 1 and step 3 — the
 *  webhook inserts the message one statement before it touches last_inbound_at,
 *  so their contact still matches the idle predicate for a moment — simply fails
 *  the guard and survives to the next run. Their new message is not silently
 *  cascaded away and the counts do not drift.
 *
 *  m.church_id / p.church_id inside the guards are LOAD-BEARING. Without them the
 *  guard is still correct (contact_id is a UUID primary key) but no longer
 *  seekable: message_contact_keyset_idx leads with church_id, and a predicate
 *  constraining only the second column cannot be used as an index seek. */
export async function purgeContactBatch(
  churchId: string,
  cutoff: Date,
  limit: number,
): Promise<number> {
  const iso = cutoff.toISOString();
  const result = await db.execute(sql`
    delete from contact
     where id in (
       select c.id from contact c
        where c.church_id = ${churchId}::uuid
          and coalesce(c.last_inbound_at, c.created_at) < ${iso}::timestamptz
          and not exists (select 1 from message m
                           where m.church_id = ${churchId}::uuid and m.contact_id = c.id)
          and not exists (select 1 from prayer_request p
                           where p.church_id = ${churchId}::uuid and p.contact_id = c.id)
        limit ${limit})
    returning id
  `);
  return (result as unknown as { rows: unknown[] }).rows.length;
}

/** System-privilege completion: no churchId, because the sweep walks every church.
 *  A status flip only — never writes counts, for the same reason
 *  completeErasureRecord does not. */
export async function completeErasureRecordSystem(recordId: string): Promise<void> {
  await db
    .update(erasureRecord)
    .set({ status: 'done', completedAt: new Date() })
    .where(eq(erasureRecord.id, recordId));
}

/** Retention rows still pending after the window are frozen at whatever counts
 *  they carry — up to and including 0/0/0. The sweep never invents a number and
 *  never attributes further deletion to the row. An all-zero done row is a real,
 *  reachable state, and Configurações LISTS it with an explanatory suffix rather
 *  than hiding it: hiding it is how 500 destroyed message bodies produce no
 *  visible line at all. */
export async function sweepStaleRetentionRecords(olderThan: Date): Promise<number> {
  const swept = await db
    .update(erasureRecord)
    .set({ status: 'done', completedAt: new Date() })
    .where(and(
      eq(erasureRecord.reason, 'retention'),
      eq(erasureRecord.status, 'pending'),
      lt(erasureRecord.createdAt, olderThan),
    ))
    .returning({ id: erasureRecord.id });
  return swept.length;
}

export interface StalePendingErasure {
  id: string;
  churchId: string;
  subjectContactId: string | null;
}

/** Subject-request receipts whose delete never completed. The caller re-runs the
 *  delete (idempotent, zero rows if it already succeeded) and then marks the
 *  record done. This is what makes the pending-first ordering safe: an interrupted
 *  erasure completes itself without anyone noticing it broke. */
export async function listStalePendingErasures(olderThan: Date): Promise<StalePendingErasure[]> {
  return db
    .select({
      id: erasureRecord.id,
      churchId: erasureRecord.churchId,
      subjectContactId: erasureRecord.subjectContactId,
    })
    .from(erasureRecord)
    .where(and(
      eq(erasureRecord.reason, 'subject_request'),
      eq(erasureRecord.status, 'pending'),
      lt(erasureRecord.createdAt, olderThan),
    ));
}
```

Note: remove any of `isNull` / `asc` from the import line if unused after writing — the linter will say.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/retention-purge.test.ts
```

Expected: PASS, 16 tests. The one to watch is `reports EVERY deleted row` — it must read exactly `1240`. If it reads `340`, the ordering was inverted and a cascade fired.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repo/retention.ts tests/retention-purge.test.ts
git commit -m "feat(lgpd): every row the purge deletes is a row some statement returned"
```

---

### Task 8: The cron route, `vercel.json`, and the privilege-boundary amendment

**Files:**
- Create: `src/app/api/cron/purge/route.ts`
- Create: `vercel.json`
- Modify: `tests/privilege-boundary.test.ts`
- Create: `tests/cron-purge.test.ts`

**Interfaces:**
- Consumes: `@/lib/repo/retention` (all of it), `@/lib/repo/member-data` (`deleteMember`), `@/lib/retention` (`retentionCutoff`).
- Produces: `GET` handler; `maxDuration = 60`; `dynamic = 'force-dynamic'`.

**Three decisions that are prevented-not-accepted, and each has a test:**

1. **`GET`, not `POST`.** Vercel Cron issues a GET. A route exporting only `POST` ships a 405 on a schedule — and since this design accepts "no in-product alarm for a dead cron", that failure would be silent and permanent.
2. **`dynamic = 'force-dynamic'`.** A cacheable GET on a path Vercel calls daily is a purge that runs once and then serves its own stale response forever.
3. **`CRON_SECRET` unset → refuse (503).** The deliberate inversion of this codebase's fail-open habit. Every other guard fails toward service; an open `/api/cron/purge` is a delete button on the public internet.

**The privilege-boundary amendment.** `walk()` currently *skips* every file in `ALLOWED` (line 45's `!ALLOWED.has(full)`), which means adding a module to `ALLOWED` also stops that module's own imports being scanned. Mirroring `platform.ts` by adding `retention.ts` to `ALLOWED` would create a cross-church module inside `src/lib/repo/` that could import `platform.ts` with nothing to catch it — opening the hole the amendment exists to close.

So the exemption becomes an **importer-keyed table** and `walk()` loses its skip entirely.

**⚠ The two sides of the map are keyed DIFFERENTLY, and getting it wrong disables the check silently.** `resolveSpecifier` strips extensions (line 58), so `importedModules()` yields **extensionless** paths — which is exactly why the existing assertion at line 77 compares against `PLATFORM_MODULE.replace(/\.tsx?$/, '')`. `walk()` yields real paths **with** `.ts`/`.tsx`. A `RESTRICTED` keyed on `'lib/repo/platform.ts'` would never match anything `importedModules` returns: **the amendment would pass green while enforcing nothing at all** — worse than the exemption it replaces, because it would look like a guard.

- [ ] **Step 1: Write the failing cron test**

Create `tests/cron-purge.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = join(process.cwd(), 'src/app/api/cron/purge/route.ts');

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('the cron route declarations', () => {
  it('exports GET and does NOT export POST', () => {
    // Vercel Cron issues a GET. A route exporting only POST ships a 405 on a
    // schedule, and this design has no alarm for a dead cron — so the failure
    // would be silent and permanent. Asserted by static read, like the export
    // routes' maxDuration check.
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+GET\b/);
    expect(src).not.toMatch(/export\s+async\s+function\s+POST\b/);
  });

  it('declares force-dynamic and maxDuration 60', () => {
    // A cacheable GET on a path Vercel calls daily is a purge that runs once and
    // then serves its own stale response every day thereafter.
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*'force-dynamic'/);
    expect(src).toMatch(/export\s+const\s+maxDuration\s*=\s*60/);
  });
});

describe('cron authentication', () => {
  async function callWith(headers: Record<string, string>) {
    const { GET } = await import('@/app/api/cron/purge/route');
    return GET(new Request('https://example.com/api/cron/purge', { headers }));
  }

  it('refuses with 503 when CRON_SECRET is unset — fails CLOSED', async () => {
    // The deliberate inversion of this codebase's fail-open habit. Every other
    // guard fails toward service; an unauthenticated purge endpoint is a public
    // delete button.
    vi.stubEnv('CRON_SECRET', '');
    const res = await callWith({ authorization: 'Bearer qualquer' });
    expect(res.status).toBe(503);
  });

  it('401s with no Authorization header', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron');
    expect((await callWith({})).status).toBe(401);
  });

  it('401s with a wrong token', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron');
    expect((await callWith({ authorization: 'Bearer errado' })).status).toBe(401);
  });

  it('401s on a token of a different length without leaking that fact', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron');
    expect((await callWith({ authorization: 'Bearer x' })).status).toBe(401);
  });
});

describe('vercel.json', () => {
  it('schedules the purge daily at 06:00 UTC on the GET path', () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
    expect(cfg.crons).toEqual([{ path: '/api/cron/purge', schedule: '0 6 * * *' }]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/cron-purge.test.ts
```

Expected: FAIL — `ENOENT: no such file or directory … route.ts`.

- [ ] **Step 3: Write `src/app/api/cron/purge/route.ts`**

```ts
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { retentionCutoff } from '@/lib/retention';
import { deleteMember } from '@/lib/repo/member-data';
import {
  addRetentionCounts,
  completeErasureRecordSystem,
  hasPurgeWork,
  listChurchIdsForPurge,
  listStalePendingErasures,
  markChurchPurged,
  openRetentionRecord,
  purgeContactBatch,
  purgeMessageBatch,
  purgePrayerBatch,
  sweepStaleRetentionRecords,
} from '@/lib/repo/retention';

/** The nightly retention purge. THE ONLY FILE PERMITTED TO IMPORT
 *  @/lib/repo/retention — see tests/privilege-boundary.test.ts.
 *
 *  Operator-facing: responses and logs stay in English, like the CLI scripts.
 *  No user-facing string is produced here. */

// Vercel Cron issues a GET. There is deliberately no POST export.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Overall wall clock. Sits under maxDuration with room to write the last
 *  receipt and return. */
const RUN_BUDGET_MS = 45_000;
/** No single church may eat the whole run. */
const CHURCH_BUDGET_MS = 10_000;
const MAX_BATCHES_PER_TABLE = 20;
const BATCH_SIZE = 500;
const MAX_CHURCHES_PER_RUN = 200;

/** Retention rows still pending after this are frozen at whatever counts they
 *  carry. Long enough that a slow-but-alive run is never swept out from under
 *  itself. */
const STALE_RETENTION_MS = 6 * 60 * 60 * 1000;
/** Subject erasures are a single member and take seconds; 15 minutes pending
 *  means the run that opened the receipt died. */
const STALE_ERASURE_MS = 15 * 60 * 1000;

function authorised(request: Request): 'ok' | 'unset' | 'denied' {
  const secret = process.env.CRON_SECRET;
  // FAILS CLOSED. This is the one guard in the codebase that does.
  if (!secret) return 'unset';

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  // Length must be compared first: timingSafeEqual throws on a length mismatch.
  // Comparing lengths leaks only the secret's length, which is not the secret.
  if (a.length !== b.length) return 'denied';
  return timingSafeEqual(a, b) ? 'ok' : 'denied';
}

export async function GET(request: Request): Promise<Response> {
  const auth = authorised(request);
  if (auth === 'unset') {
    console.error('[cron/purge] CRON_SECRET is not set — refusing to run. An unauthenticated purge endpoint is a public delete button.');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (auth === 'denied') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const cutoff = retentionCutoff(now);
  const summary = { churchesVisited: 0, churchesPurged: 0, messages: 0, prayers: 0, contacts: 0, erasuresCompleted: 0, retentionSwept: 0 };

  // --- Sweeps first: they are cheap, bounded, and they heal receipts from a run
  //     that died. Doing them before the budget is spent means an interrupted
  //     erasure is completed even on a night when the purge itself runs long.
  try {
    const stale = await listStalePendingErasures(new Date(now.getTime() - STALE_ERASURE_MS));
    for (const rec of stale) {
      // Idempotent: zero rows if the delete already succeeded. What the record
      // asserts — this contact's data is not in the database — becomes true either
      // way, and no counts are written because they were set at open time.
      if (rec.subjectContactId) await deleteMember(rec.churchId, rec.subjectContactId);
      await completeErasureRecordSystem(rec.id);
      summary.erasuresCompleted += 1;
    }
    summary.retentionSwept = await sweepStaleRetentionRecords(
      new Date(now.getTime() - STALE_RETENTION_MS),
    );
  } catch (error) {
    console.error('[cron/purge] sweep failed', error);
  }

  // --- The rotation. Least-recently-purged first; the cursor advances when a
  //     slice ENDS, finished or not.
  let churchIds: string[] = [];
  try {
    churchIds = await listChurchIdsForPurge(MAX_CHURCHES_PER_RUN);
  } catch (error) {
    console.error('[cron/purge] could not list churches', error);
    return NextResponse.json({ error: 'church list failed' }, { status: 500 });
  }

  for (const churchId of churchIds) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) break;
    summary.churchesVisited += 1;

    try {
      // Probe: no work → advance the cursor and write NO record. This is what
      // keeps "a retention row means something was actually deleted" true while
      // still writing the row before the deletes.
      if (!(await hasPurgeWork(churchId, cutoff))) {
        await markChurchPurged(churchId, new Date());
        continue;
      }

      const recordId = await openRetentionRecord(churchId);
      summary.churchesPurged += 1;
      const sliceStart = Date.now();
      const withinSlice = () =>
        Date.now() - sliceStart < CHURCH_BUDGET_MS && Date.now() - startedAt < RUN_BUDGET_MS;

      // CHILDREN FIRST. Both arms of each predicate include rows belonging to
      // contacts about to be purged, so step 3's cascade can never fire.
      for (const [key, purge] of [
        ['messages', purgeMessageBatch],
        ['prayers', purgePrayerBatch],
      ] as const) {
        let batches = 0;
        while (withinSlice() && batches < MAX_BATCHES_PER_TABLE) {
          const n = await purge(churchId, cutoff, BATCH_SIZE);
          if (n === 0) break;
          batches += 1;
          summary[key] += n;
          // Committed AFTER the delete that earned it. This is why the receipt
          // never OVERSTATES: it can lag by at most one batch, never lead.
          await addRetentionCounts(recordId, churchId, {
            messages: key === 'messages' ? n : 0,
            prayers: key === 'prayers' ? n : 0,
            contacts: 0,
          });
          if (n < BATCH_SIZE) break;
        }
      }

      // GUARDED PARENT LAST.
      let batches = 0;
      while (withinSlice() && batches < MAX_BATCHES_PER_TABLE) {
        const n = await purgeContactBatch(churchId, cutoff, BATCH_SIZE);
        if (n === 0) break;
        batches += 1;
        summary.contacts += n;
        await addRetentionCounts(recordId, churchId, { messages: 0, prayers: 0, contacts: n });
        if (n < BATCH_SIZE) break;
      }

      await completeErasureRecordSystem(recordId);
    } catch (error) {
      // One church's failure must not end the run for every other church.
      console.error(`[cron/purge] church ${churchId} failed`, error);
    }

    // Advanced whether or not the slice finished — that is what makes the
    // rotation a rotation rather than a queue one big church can starve.
    try {
      await markChurchPurged(churchId, new Date());
    } catch (error) {
      console.error(`[cron/purge] could not advance cursor for ${churchId}`, error);
    }
  }

  console.log('[cron/purge]', JSON.stringify({ ...summary, ms: Date.now() - startedAt }));
  return NextResponse.json({ ok: true, ...summary });
}
```

- [ ] **Step 4: Create `vercel.json`**

No file exists today. 06:00 UTC = 03:00 in Brasília.

```json
{
  "crons": [{ "path": "/api/cron/purge", "schedule": "0 6 * * *" }]
}
```

- [ ] **Step 5: Run the cron test**

```bash
npx vitest run tests/cron-purge.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Amend `tests/privilege-boundary.test.ts` — the importer-keyed map**

Replace lines 30–48 (the `PLATFORM_MODULE`/`ALLOWED` block and `walk`) with:

```ts
/** The owner-only module. Nothing else under the scanned roots is owner-only:
 *  src/app/owner/ reaches the platform repo directly and otherwise imports only
 *  shared modules (church-status, church-defaults, provisioning) and
 *  src/lib/repo/owner.ts, which is owner-account auth, not cross-church data. */
const PLATFORM_MODULE = join(SRC, 'lib/repo/platform.ts');
/** The system-only retention repo. Cross-church by construction, like the
 *  platform repo — but unlike it, ONE file is permitted to import it. */
const RETENTION_MODULE = join(SRC, 'lib/repo/retention.ts');
const CRON_PURGE_ROUTE = join(SRC, 'app/api/cron/purge/route.ts');

const base = (p: string) => p.replace(/\.tsx?$/, '');

/** Modules whose privilege is bounded by WHO may import them — not by being
 *  invisible to the scanner.
 *
 *  KEY:   the restricted module, EXTENSIONLESS — that is what importedModules()
 *         returns, because resolveSpecifier strips extensions (see line ~58 and
 *         the resolver test below).
 *  VALUE: the files permitted to import it, WITH extension — that is what walk()
 *         returns.
 *
 *  Getting those two sides the same way round is not cosmetic: a key written as
 *  'lib/repo/platform.ts' would match nothing importedModules ever produces, and
 *  the whole boundary check would pass green while enforcing nothing — worse than
 *  the exemption it replaces, because it would look like a guard.
 *
 *  Every file here is STILL WALKED. That is the point of the rewrite: the old
 *  `!ALLOWED.has(full)` filter meant a restricted module's own imports were never
 *  checked, so a cross-church module could have imported the platform repo with
 *  nothing to catch it. */
const RESTRICTED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [base(PLATFORM_MODULE), new Set<string>()],              // importable by NOTHING under the roots
  [base(RETENTION_MODULE), new Set<string>([CRON_PURGE_ROUTE])],
]);

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    // No ALLOWED skip. Restricted modules are scanned like everyone else.
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}
```

- [ ] **Step 7: Replace the boundary assertions**

Replace the first `it(...)` inside `describe('privilege boundary', ...)` with these four:

```ts
  it('no file imports a restricted module unless it is on that module\'s allowlist', () => {
    const files = CHURCH_FACING_ROOTS.flatMap((d) => walk(d));
    // Guard against a bad glob silently passing by scanning nothing.
    expect(files.length).toBeGreaterThan(40);

    const offenders: string[] = [];
    for (const file of files) {
      for (const imported of importedModules(file)) {
        const allowed = RESTRICTED.get(imported);
        if (allowed && !allowed.has(file)) offenders.push(`${file} -> ${imported}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the restricted modules are themselves SCANNED, not exempted', () => {
    // The property the old ALLOWED skip could not express. If these ever drop out
    // of walk()'s output, a restricted module could import another one unnoticed.
    const files = CHURCH_FACING_ROOTS.flatMap((d) => walk(d));
    expect(files).toContain(PLATFORM_MODULE);
    expect(files).toContain(RETENTION_MODULE);
  });

  it('the retention repo does not import the platform repo', () => {
    // Only checkable because of the test above. Two cross-church modules that can
    // reach each other are one module with two names.
    expect(importedModules(RETENTION_MODULE)).not.toContain(base(PLATFORM_MODULE));
  });

  it('RESTRICTED keys really match what the resolver produces', () => {
    // Without this, a .ts-suffixed key makes the whole boundary check pass while
    // matching nothing, and every other boundary test still goes green.
    const cronImports = importedModules(CRON_PURGE_ROUTE);
    const retentionKey = cronImports.find((m) => m.endsWith('repo/retention'));
    expect(retentionKey, 'the cron route must import the retention repo').toBeDefined();
    expect(RESTRICTED.has(retentionKey!)).toBe(true);
  });
```

- [ ] **Step 8: Run the boundary suite**

```bash
npx vitest run tests/privilege-boundary.test.ts
```

Expected: PASS. If `no file imports a restricted module` now reports `src/lib/repo/platform.ts -> …`, then `platform.ts` imports something restricted — it should import only `drizzle-orm`, `@/db/client`, `@/db/schema` and `@/lib/church-status`, none of which is restricted. Investigate rather than re-adding an exemption.

- [ ] **Step 9: Run the full suite**

```bash
npx vitest run --maxWorkers=4
```

Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/cron/purge/route.ts vercel.json tests/cron-purge.test.ts tests/privilege-boundary.test.ts
git commit -m "feat(lgpd): the purge runs nightly, and the module that can reach every church has exactly one door"
```

---

### Task 9: The member data page and its two actions

**Files:**
- Create: `src/app/admin/(protected)/caixa/[contactId]/dados/page.tsx`
- Create: `src/app/admin/(protected)/caixa/[contactId]/dados/actions.ts`
- Create: `src/app/admin/(protected)/caixa/[contactId]/dados/DeleteForm.tsx`
- Modify: `src/app/admin/(protected)/caixa/[contactId]/page.tsx` (one link)
- Create: `tests/member-data-actions.test.ts`

**Interfaces:**
- Consumes: `requireReadableSession`, `requireDataRightsSession`, `blockedMessage` from `@/lib/auth/writable`; all of `@/lib/repo/member-data`; all of `@/lib/repo/erasure`; `hashPhone` from `@/lib/erasure-hash`.
- Produces: `deleteMemberData(contactId, prev, formData): Promise<DeleteResult>`, `renameMember(contactId, prev, formData): Promise<RenameResult>`.

**The action contract — four shapes, and it never throws:**

```ts
type DeleteResult =
  | { ok: true; recordedAt: Date }   // erased in this call
  | { alreadyDeleted: true }         // a completed receipt already exists
  | { pending: true; since: Date }   // a receipt exists, the delete has not succeeded yet
  | { error: string };               // pt-BR
```

**The flow, exactly:**

1. `requireDataRightsSession()` — revocation re-checked, suspension deliberately **not**.
2. `formData.get('confirm') !== 'APAGAR'` → `{ error: 'Escreva APAGAR para confirmar.' }`. **Nothing is read or written before this.**
3. `loadMemberSubject` + `countMemberRows`. Contact absent → skip to **step 7**'s lookup.
4. `hashPhone(contact.phone)` — pure, in memory, never logged.
5. `openSubjectErasure(...)` — the one conditional INSERT.
6. **One row returned → this call owns the erasure.** `deleteMember` then `completeErasureRecord`. Return `{ ok: true, recordedAt }`. *If `deleteMember` returns 0 here, still complete the record*: what it asserts — this contact's data is not in the database — is true, and a pending row would be an alarm about an already-correct state.
7. **Zero rows returned → `findErasureByContact` decides which of three things happened:** a `done` record → `{ alreadyDeleted: true }`; a `pending` record → re-run the delete and complete (success → `{ ok: true }`, failure → `{ pending: true, since }`); no record at all → `{ error: 'Conversa não encontrada.' }`.

- [ ] **Step 1: Write the failing action test**

Create `tests/member-data-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireDataRightsSession = vi.fn();
const loadMemberSubject = vi.fn();
const countMemberRows = vi.fn();
const deleteMember = vi.fn();
const renameContact = vi.fn();
const openSubjectErasure = vi.fn();
const completeErasureRecord = vi.fn();
const findErasureByContact = vi.fn();
const hashPhone = vi.fn();

vi.mock('@/lib/auth/writable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/writable')>('@/lib/auth/writable');
  return { ...actual, requireDataRightsSession };
});
vi.mock('@/lib/repo/member-data', () => ({
  loadMemberSubject, countMemberRows, deleteMember, renameContact,
}));
vi.mock('@/lib/repo/erasure', () => ({
  openSubjectErasure, completeErasureRecord, findErasureByContact,
}));
vi.mock('@/lib/erasure-hash', () => ({ hashPhone }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { deleteMemberData, renameMember } from '@/app/admin/(protected)/caixa/[contactId]/dados/actions';

const SESSION = { adminUserId: 'a1', churchId: 'c1', name: 'Secretária' };
const CONTACT = { id: 'ct1', name: 'Maria', phone: '5511999998888', mode: 'bot', lastInboundAt: null, createdAt: new Date() };
const OPENED_AT = new Date('2026-08-11T10:00:00.000Z');

function confirmed(word = 'APAGAR'): FormData {
  const fd = new FormData();
  fd.set('confirm', word);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireDataRightsSession.mockResolvedValue(SESSION);
  loadMemberSubject.mockResolvedValue(CONTACT);
  countMemberRows.mockResolvedValue({ messages: 412, prayers: 3, prayersNovo: 1 });
  hashPhone.mockReturnValue('hash-abc');
  openSubjectErasure.mockResolvedValue({ id: 'rec1', createdAt: OPENED_AT });
  deleteMember.mockResolvedValue(1);
  completeErasureRecord.mockResolvedValue(undefined);
});

describe('deleteMemberData — the confirmation gate', () => {
  it('refuses without the typed word, reading and writing NOTHING first', async () => {
    const result = await deleteMemberData('ct1', {}, confirmed('apagar tudo'));
    expect(result).toEqual({ error: 'Escreva APAGAR para confirmar.' });
    expect(loadMemberSubject).not.toHaveBeenCalled();
    expect(openSubjectErasure).not.toHaveBeenCalled();
  });

  it('is case-sensitive — "apagar" is not the confirmation', async () => {
    expect(await deleteMemberData('ct1', {}, confirmed('apagar')))
      .toEqual({ error: 'Escreva APAGAR para confirmar.' });
  });
});

describe('deleteMemberData — the happy path', () => {
  it('opens the receipt BEFORE deleting, then completes it', async () => {
    const order: string[] = [];
    openSubjectErasure.mockImplementation(async () => { order.push('open'); return { id: 'rec1', createdAt: OPENED_AT }; });
    deleteMember.mockImplementation(async () => { order.push('delete'); return 1; });
    completeErasureRecord.mockImplementation(async () => { order.push('complete'); });

    const result = await deleteMemberData('ct1', {}, confirmed());
    expect(result).toEqual({ ok: true, recordedAt: OPENED_AT });
    // Evidence before destruction. The reverse ordering would destroy a year of
    // message bodies with zero Art. 6 X evidence if the insert failed.
    expect(order).toEqual(['open', 'delete', 'complete']);
  });

  it('carries the PRE-DELETE counts and the phone hash onto the receipt', async () => {
    await deleteMemberData('ct1', {}, confirmed());
    expect(openSubjectErasure).toHaveBeenCalledWith({
      churchId: 'c1', contactId: 'ct1', phoneHash: 'hash-abc',
      performedByEmail: 'Secretária', messages: 412, prayers: 3,
    });
  });

  it('proceeds when the hash secret is missing, storing null', async () => {
    // Fails TOWARD the member's right: a missing operator env var must never be
    // the reason a statutory erasure does not happen.
    hashPhone.mockReturnValue(null);
    const result = await deleteMemberData('ct1', {}, confirmed());
    expect(result).toEqual({ ok: true, recordedAt: OPENED_AT });
    expect(openSubjectErasure).toHaveBeenCalledWith(expect.objectContaining({ phoneHash: null }));
  });

  it('completes the record even when deleteMember reports 0 rows', async () => {
    // The contact vanished between the insert and the delete. The record's
    // assertion — this contact's data is not in the database — is true, so a
    // pending alarm about an already-correct state would be noise.
    deleteMember.mockResolvedValue(0);
    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ ok: true, recordedAt: OPENED_AT });
    expect(completeErasureRecord).toHaveBeenCalledWith('rec1', 'c1');
  });
});

describe('deleteMemberData — zero rows inserted', () => {
  it('reports alreadyDeleted on the double-click, writing no second record', async () => {
    openSubjectErasure.mockResolvedValue(null);
    findErasureByContact.mockResolvedValue({ id: 'rec1', status: 'done', createdAt: OPENED_AT });

    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ alreadyDeleted: true });
    expect(deleteMember).not.toHaveBeenCalled();
  });

  it('retries a pending record and completes it', async () => {
    openSubjectErasure.mockResolvedValue(null);
    findErasureByContact.mockResolvedValue({ id: 'rec1', status: 'pending', createdAt: OPENED_AT });
    deleteMember.mockResolvedValue(1);

    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ ok: true, recordedAt: OPENED_AT });
    expect(completeErasureRecord).toHaveBeenCalledWith('rec1', 'c1');
  });

  it('reports pending when the retry also fails', async () => {
    openSubjectErasure.mockResolvedValue(null);
    findErasureByContact.mockResolvedValue({ id: 'rec1', status: 'pending', createdAt: OPENED_AT });
    deleteMember.mockRejectedValue(new Error('neon down'));

    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ pending: true, since: OPENED_AT });
  });

  it('reports not-found when there is no record and no contact', async () => {
    loadMemberSubject.mockResolvedValue(null);
    openSubjectErasure.mockResolvedValue(null);
    findErasureByContact.mockResolvedValue(null);

    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ error: 'Conversa não encontrada.' });
  });
});

describe('deleteMemberData — failures', () => {
  it('deletes NOTHING when the receipt cannot be written', async () => {
    openSubjectErasure.mockRejectedValue(new Error('insert failed'));
    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({
      error: 'Não foi possível registrar o comprovante de exclusão. Nada foi apagado — tente novamente.',
    });
    expect(deleteMember).not.toHaveBeenCalled();
  });

  it('reports the pending banner when the delete throws after the receipt opened', async () => {
    deleteMember.mockRejectedValue(new Error('neon down'));
    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({
      error: 'A exclusão foi iniciada mas não terminou. Ela ficou marcada como pendente e será concluída automaticamente; você também pode tentar de novo agora.',
    });
  });

  it('surfaces a revoked session as its pt-BR message', async () => {
    requireDataRightsSession.mockResolvedValue({ blocked: 'revoked' });
    const result = await deleteMemberData('ct1', {}, confirmed()) as { error: string };
    expect(result.error).toContain('não tem mais acesso');
  });
});

describe('renameMember', () => {
  it('renames and reports success', async () => {
    renameContact.mockResolvedValue(1);
    const fd = new FormData();
    fd.set('name', 'Maria de Souza');
    expect(await renameMember('ct1', {}, fd)).toEqual({ ok: 'Nome atualizado.' });
  });

  it('refuses a blank name', async () => {
    const fd = new FormData();
    fd.set('name', '   ');
    expect(await renameMember('ct1', {}, fd)).toEqual({ error: 'O nome não pode ficar em branco.' });
    expect(renameContact).not.toHaveBeenCalled();
  });

  it('reports not-found when the contact is another church\'s', async () => {
    renameContact.mockResolvedValue(0);
    const fd = new FormData();
    fd.set('name', 'Invadido');
    expect(await renameMember('ct1', {}, fd)).toEqual({ error: 'Conversa não encontrada.' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/member-data-actions.test.ts
```

Expected: FAIL — cannot resolve the actions module.

- [ ] **Step 3: Write the actions**

Create `src/app/admin/(protected)/caixa/[contactId]/dados/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { blockedMessage, requireDataRightsSession } from '@/lib/auth/writable';
import { hashPhone } from '@/lib/erasure-hash';
import {
  completeErasureRecord,
  findErasureByContact,
  openSubjectErasure,
} from '@/lib/repo/erasure';
import {
  countMemberRows,
  deleteMember,
  loadMemberSubject,
  renameContact,
} from '@/lib/repo/member-data';

/** Art. 18 III and VI. Both actions use requireDataRightsSession, which
 *  deliberately does NOT check suspension — see the long comment on that guard.
 *  This file is one of exactly THREE permitted callers; a fourth fails
 *  tests/privilege-boundary.test.ts. */

export type DeleteResult =
  | { ok: true; recordedAt: Date }
  | { alreadyDeleted: true }
  | { pending: true; since: Date }
  | { error: string };

const RECORD_FAILED =
  'Não foi possível registrar o comprovante de exclusão. Nada foi apagado — tente novamente.';
const DELETE_FAILED_AFTER_RECORD =
  'A exclusão foi iniciada mas não terminou. Ela ficou marcada como pendente e será concluída automaticamente; você também pode tentar de novo agora.';
const NOT_FOUND = 'Conversa não encontrada.';

export async function deleteMemberData(
  contactId: string,
  _prev: DeleteResult | Record<string, never>,
  formData: FormData,
): Promise<DeleteResult> {
  const session = await requireDataRightsSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId, name } = session;

  // Nothing is read or written before the confirmation. A destructive action must
  // not have side effects on the path where the user got the confirmation wrong.
  if (formData.get('confirm') !== 'APAGAR') {
    return { error: 'Escreva APAGAR para confirmar.' };
  }

  const contact = await loadMemberSubject(churchId, contactId);
  const counts = contact
    ? await countMemberRows(churchId, contactId)
    : { messages: 0, prayers: 0, prayersNovo: 0 };

  let opened: { id: string; createdAt: Date } | null = null;
  if (contact) {
    try {
      opened = await openSubjectErasure({
        churchId,
        contactId,
        // Pure, in memory, never logged. Null when the secret is unset — the
        // erasure still proceeds.
        phoneHash: hashPhone(contact.phone),
        performedByEmail: name,
        messages: counts.messages,
        prayers: counts.prayers,
      });
    } catch {
      // Both writes hit the same database. If the receipt cannot be written the
      // delete would not have committed either, so there is no state to reconcile.
      return { error: RECORD_FAILED };
    }
  }

  // --- This call owns the erasure.
  if (opened) {
    try {
      await deleteMember(churchId, contactId);
      // Completed even on 0 rows: what the record asserts — this contact's data is
      // not in the database — is true either way, and a pending row would be an
      // alarm about an already-correct state.
      await completeErasureRecord(opened.id, churchId);
    } catch {
      return { error: DELETE_FAILED_AFTER_RECORD };
    }
    revalidatePath('/admin/caixa');
    return { ok: true, recordedAt: opened.createdAt };
  }

  // --- Zero rows inserted. Three possibilities, and the existing record says which.
  const existing = await findErasureByContact(churchId, contactId);
  if (!existing) return { error: NOT_FOUND };

  if (existing.status === 'done') {
    // The double-click, or a second secretary. No second record was written —
    // the partial unique index made that impossible.
    return { alreadyDeleted: true };
  }

  // A previous attempt opened a receipt and failed to delete. deleteMember is
  // idempotent, so retrying is always safe.
  try {
    await deleteMember(churchId, contactId);
    await completeErasureRecord(existing.id, churchId);
    revalidatePath('/admin/caixa');
    return { ok: true, recordedAt: existing.createdAt };
  } catch {
    return { pending: true, since: existing.createdAt };
  }
}

export type RenameResult = { ok?: string; error?: string };

/** Art. 18 III. Durable: findOrCreateContact returns an existing row untouched and
 *  no code path writes contact.name after creation, so this survives the member's
 *  next inbound message. Message and prayer bodies are deliberately NOT editable —
 *  a conversation log is a record of an event, and letting a church rewrite what a
 *  member said destroys the only value it has. */
export async function renameMember(
  contactId: string,
  _prev: RenameResult,
  formData: FormData,
): Promise<RenameResult> {
  const session = await requireDataRightsSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'O nome não pode ficar em branco.' };

  const updated = await renameContact(session.churchId, contactId, name);
  if (updated === 0) return { error: NOT_FOUND };

  revalidatePath(`/admin/caixa/${contactId}`);
  return { ok: 'Nome atualizado.' };
}
```

- [ ] **Step 4: Run the action test and watch it pass**

```bash
npx vitest run tests/member-data-actions.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Write the delete form client component**

Create `src/app/admin/(protected)/caixa/[contactId]/dados/DeleteForm.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { deleteMemberData, type DeleteResult } from './actions';

const fmt = (d: Date) => new Date(d).toLocaleDateString('pt-BR');

export function DeleteForm({
  contactId, prayersNovo, inFlight,
}: {
  contactId: string;
  prayersNovo: number;
  inFlight: boolean;
}) {
  const [state, action, pending] = useActionState<DeleteResult | Record<string, never>, FormData>(
    deleteMemberData.bind(null, contactId),
    {},
  );

  return (
    <section className="rounded-lg border border-red-300 bg-red-50 p-4">
      <h2 className="text-lg font-semibold text-red-900">Apagar os dados desta pessoa</h2>
      <p className="mt-2 text-sm text-red-900">
        Apaga o cadastro, todas as mensagens e todos os pedidos de oração desta pessoa.
        É definitivo e não pode ser desfeito.
      </p>

      {prayersNovo > 0 && (
        <p className="mt-2 text-sm font-medium text-red-900">
          Atenção: {prayersNovo} pedido(s) de oração ainda marcado(s) como &quot;novo&quot; também será(ão) apagado(s).
        </p>
      )}

      {inFlight && (
        <p className="mt-2 text-sm font-medium text-red-900">
          Esta conversa está em atendimento e a janela de 24 horas ainda está aberta.
          Depois de apagar não será possível responder por aqui — se precisar avisar a pessoa, faça isso antes.
        </p>
      )}

      <p className="mt-2 text-sm text-red-900">
        Apagar não bloqueia o número. Se a pessoa escrever de novo, uma nova conversa começa do zero.
      </p>

      <form action={action} className="mt-4">
        <label htmlFor="confirm" className="block text-sm font-medium text-red-900">
          Para confirmar, escreva APAGAR
        </label>
        <input
          id="confirm"
          name="confirm"
          autoComplete="off"
          className="mt-1 w-full min-h-11 rounded border border-red-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="mt-3 min-h-11 w-full rounded bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          Apagar definitivamente
        </button>
      </form>

      {'ok' in state && state.ok && (
        <p className="mt-3 text-sm font-medium text-green-800">
          Dados apagados. Comprovante registrado em {fmt(state.recordedAt)}.
        </p>
      )}
      {'alreadyDeleted' in state && (
        <p className="mt-3 text-sm text-red-900">Estes dados já haviam sido apagados.</p>
      )}
      {'pending' in state && (
        <p className="mt-3 text-sm text-red-900">
          Exclusão pendente desde {fmt(state.since)}. Tente novamente para concluir.
        </p>
      )}
      {'error' in state && state.error && (
        <p className="mt-3 text-sm text-red-900">{state.error}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Write the page**

Create `src/app/admin/(protected)/caixa/[contactId]/dados/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireReadableSession } from '@/lib/auth/writable';
import { countMemberRows, loadMemberSubject } from '@/lib/repo/member-data';
import { isReplyWindowOpen } from '@/lib/reply-window';
import { DeleteForm } from './DeleteForm';
import { ExportButtons } from './ExportButtons';
import { NameForm } from './NameForm';

/** requireReadableSession is MANDATORY here — tests/privilege-boundary.test.ts
 *  fails any protected page that does not use it. The data-rights guard is for the
 *  ACTIONS, not for the page. */
export default async function MemberDataPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const { churchId } = await requireReadableSession();

  const contact = await loadMemberSubject(churchId, contactId);
  if (!contact) notFound();

  const counts = await countMemberRows(churchId, contactId);
  const now = new Date();
  const inFlight = contact.mode === 'human' && isReplyWindowOpen(contact.lastInboundAt, now);
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR') : '—');

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <Link href={`/admin/caixa/${contactId}`} className="text-sm text-blue-700 underline">
        ← Voltar para a conversa
      </Link>

      <header>
        <h1 className="text-xl font-semibold">Dados desta pessoa</h1>
        <p className="mt-2 text-sm text-gray-700">
          Tudo o que a igreja guarda sobre esta pessoa. Use esta página quando alguém pedir uma
          cópia dos seus dados, a correção do nome ou a exclusão de tudo (LGPD, art. 18).
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Se o número da pessoa não aparece na Caixa de Entrada, a igreja não guarda nada sobre
          ela — pode responder isso.
        </p>
      </header>

      <section className="rounded-lg border p-4 text-sm">
        <p className="break-words">
          <strong>Cadastro:</strong> nome e número de WhatsApp · <strong>Mensagens:</strong>{' '}
          {counts.messages} · <strong>Pedidos de oração:</strong> {counts.prayers} ·{' '}
          <strong>Primeiro registro:</strong> {fmt(contact.createdAt)} ·{' '}
          <strong>Última mensagem recebida:</strong> {fmt(contact.lastInboundAt)}
        </p>
      </section>

      <NameForm contactId={contactId} currentName={contact.name} />

      <p className="text-sm text-gray-600">
        As mensagens e os pedidos de oração não podem ser editados: são o registro do que foi
        dito. Se a pessoa quiser que algo saia daqui, a saída é apagar os dados dela.
      </p>

      <ExportButtons contactId={contactId} />

      <DeleteForm contactId={contactId} prayersNovo={counts.prayersNovo} inFlight={inFlight} />
    </main>
  );
}
```

- [ ] **Step 7: Write the name form**

Create `src/app/admin/(protected)/caixa/[contactId]/dados/NameForm.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { renameMember, type RenameResult } from './actions';

export function NameForm({ contactId, currentName }: { contactId: string; currentName: string | null }) {
  const [state, action, pending] = useActionState<RenameResult, FormData>(
    renameMember.bind(null, contactId),
    {},
  );

  return (
    <form action={action} className="rounded-lg border p-4">
      <label htmlFor="name" className="block text-sm font-medium">Nome</label>
      <input
        id="name"
        name="name"
        defaultValue={currentName ?? ''}
        className="mt-1 w-full min-h-11 rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-3 min-h-11 rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-60"
      >
        Salvar nome
      </button>
      {state.ok && <p className="mt-2 text-sm text-green-800">{state.ok}</p>}
      {state.error && <p className="mt-2 text-sm text-red-800">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 8: Add the link on the conversation page**

In `src/app/admin/(protected)/caixa/[contactId]/page.tsx`, add a link in the header area (beside the existing back link), pointing at the new page:

```tsx
      <Link
        href={`/admin/caixa/${contactId}/dados`}
        className="text-sm text-blue-700 underline"
      >
        Dados e privacidade
      </Link>
```

- [ ] **Step 9: Typecheck (ExportButtons lands in Task 10)**

`ExportButtons` does not exist yet. Create a placeholder so this task typechecks on its own, and Task 10 replaces its body:

```tsx
// src/app/admin/(protected)/caixa/[contactId]/dados/ExportButtons.tsx
'use client';
export function ExportButtons({ contactId }: { contactId: string }) {
  return <div data-contact={contactId} />;
}
```

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add "src/app/admin/(protected)/caixa/[contactId]/dados" "src/app/admin/(protected)/caixa/[contactId]/page.tsx" tests/member-data-actions.test.ts
git commit -m "feat(lgpd): the page a secretary opens when someone asks what the church knows"
```

---

### Task 10: The member export route

**Files:**
- Create: `src/app/api/dados/[contactId]/route.ts`
- Rewrite: `src/app/admin/(protected)/caixa/[contactId]/dados/ExportButtons.tsx`
- Create: `tests/member-export-route.test.ts`

**Interfaces:**
- Consumes: `checkDataRightsSession`, `@/lib/repo/member-data`, `@/lib/member-export`, `getChurchById`.
- Produces: `GET`; `maxDuration = 60`; `dynamic = 'force-dynamic'`.

**Bounding, and why each number is where it is:**

- Response body is a `ReadableStream`. **At most one page — 1 000 rows — in memory at a time.**
- Paging is **keyset** on `(created_at, id)`, ascending, covered by `message_contact_keyset_idx`.
- **Ceiling:** 50 000 rows per collection, or a **45 s** wall-clock budget, whichever comes first.
- **`maxDuration = 60` is not decoration.** No file under `src/` set it before this subsystem, so this route would inherit Vercel's 10 s Hobby default — and the entire 45 s bounding design would be dead code on precisely the member whose history is large enough to need it.

**The continuation is a keyset cursor, never a date.** Truncation happens at a position `(created_at, id)` which is mid-second. Resuming at `>= date` re-exports everything earlier that day; resuming at `> date` skips the rest of it. There is no third option — a date cursor cannot be both gapless and overlap-free. Neither `created_at` nor a `defaultRandom()` row id is personal data; the excluded values are the phone, the name, the body and `wa_message_id`, and none of those is in the cursor.

- [ ] **Step 1: Write the failing route test**

Create `tests/member-export-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const checkDataRightsSession = vi.fn();
const loadMemberSubject = vi.fn();
const countMemberRows = vi.fn();
const pageMessages = vi.fn();
const pagePrayers = vi.fn();
const getChurchById = vi.fn();

vi.mock('@/lib/auth/writable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/writable')>('@/lib/auth/writable');
  return { ...actual, checkDataRightsSession };
});
vi.mock('@/lib/repo/member-data', () => ({
  loadMemberSubject, countMemberRows, pageMessages, pagePrayers,
}));
vi.mock('@/lib/repo/church-admin', () => ({ getChurchById }));

import { GET } from '@/app/api/dados/[contactId]/route';

const ROUTE = join(process.cwd(), 'src/app/api/dados/[contactId]/route.ts');
const CONTACT = {
  id: 'ct1', name: 'Maria', phone: '5511999998888', mode: 'bot',
  lastInboundAt: new Date('2026-08-01T13:40:00Z'), createdAt: new Date('2026-01-04T18:22:00Z'),
};

function msg(i: number, at: string) {
  return { id: `m${i}`, waMessageId: `wamid.${i}`, direction: 'inbound' as const, body: `msg ${i}`, createdAt: new Date(at) };
}

async function call(url = 'https://x/api/dados/ct1'): Promise<Response> {
  return GET(new Request(url), { params: Promise.resolve({ contactId: 'ct1' }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkDataRightsSession.mockResolvedValue({ adminUserId: 'a1', churchId: 'c1', name: 'Secretária' });
  loadMemberSubject.mockResolvedValue(CONTACT);
  countMemberRows.mockResolvedValue({ messages: 2, prayers: 1, prayersNovo: 0 });
  getChurchById.mockResolvedValue({ id: 'c1', name: 'Igreja Exemplo' });
  pageMessages.mockResolvedValue([]);
  pagePrayers.mockResolvedValue([]);
});

describe('route declarations', () => {
  it('declares maxDuration 60 and force-dynamic', () => {
    // Without maxDuration the platform kills this at 10 s on the Hobby plan and
    // the whole 45 s bounding design never runs.
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/export\s+const\s+maxDuration\s*=\s*60/);
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*'force-dynamic'/);
  });
});

describe('headers and isolation', () => {
  it('serves JSON as an attachment whose filename carries no phone or name', async () => {
    const res = await call();
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cd = res.headers.get('content-disposition')!;
    expect(cd).toContain('dados-membro-');
    // It lands in a shared secretariat's Downloads folder.
    expect(cd).not.toContain('5511999998888');
    expect(cd).not.toContain('Maria');
  });

  it('404s for another church\'s contactId', async () => {
    loadMemberSubject.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Conversa não encontrada.' });
  });

  it('401s with no session, without leaking a redirect', async () => {
    checkDataRightsSession.mockResolvedValue({ blocked: 'unauthenticated' });
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('NEXT_REDIRECT');
  });
});

describe('the body', () => {
  it('streams header, messages, prayers and footer as one valid JSON document', async () => {
    pageMessages.mockResolvedValueOnce([msg(1, '2026-01-04T18:22:00Z'), msg(2, '2026-01-04T18:22:01Z')]).mockResolvedValue([]);
    pagePrayers.mockResolvedValueOnce([{ id: 'p1', status: 'orado' as const, text: 'ore', createdAt: new Date('2026-03-02T20:10:00Z') }]).mockResolvedValue([]);

    const parsed = JSON.parse(await (await call()).text());
    expect(parsed.igreja).toBe('Igreja Exemplo');
    expect(parsed.titular.whatsapp).toBe('5511999998888');
    expect(parsed.mensagens).toHaveLength(2);
    expect(parsed.mensagens[0]).toEqual({ quando: '2026-01-04T18:22:00.000Z', de: 'membro', texto: 'msg 1' });
    expect(parsed.pedidos_de_oracao).toHaveLength(1);
    expect(parsed.compartilhamento.join(' ')).toContain('WhatsApp');
    expect(parsed.aviso).toBeUndefined();
  });

  it('never emits wa_message_id or internal UUIDs', async () => {
    pageMessages.mockResolvedValueOnce([msg(1, '2026-01-04T18:22:00Z')]).mockResolvedValue([]);
    const text = await (await call()).text();
    expect(text).not.toContain('wamid');
    expect(text).not.toContain('"m1"');
  });
});

describe('truncation', () => {
  it('closes as valid JSON with aviso AND continuacao when the ceiling is hit', async () => {
    // Forced by making every page full, so the row ceiling is what stops it.
    const full = Array.from({ length: 1000 }, (_, i) => msg(i, '2026-03-12T19:04:11.208Z'));
    pageMessages.mockResolvedValue(full);

    const parsed = JSON.parse(await (await call()).text());
    expect(parsed.aviso).toContain('12/03/2026');
    expect(parsed.continuacao).toMatch(/^mensagens:2026-03-12T19:04:11\.208Z,/);
    // Both keys or neither: a file saying data is missing with no way to fetch it
    // would be a dead end.
    expect(parsed.continuacao).toBeDefined();
  });

  it('resumes from ?apos= with no overlap and no gap', async () => {
    pageMessages.mockResolvedValue([]);
    pagePrayers.mockResolvedValue([]);
    await call('https://x/api/dados/ct1?apos=mensagens:2026-03-12T19:04:11.208Z,7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77');

    expect(pageMessages).toHaveBeenCalledWith(
      'c1', 'ct1',
      { createdAt: new Date('2026-03-12T19:04:11.208Z'), id: '7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77' },
      expect.any(Number),
    );
  });

  it('ignores a malformed cursor rather than 500ing', async () => {
    const res = await call('https://x/api/dados/ct1?apos=lixo');
    expect(res.status).toBe(200);
    expect(pageMessages).toHaveBeenCalledWith('c1', 'ct1', null, expect.any(Number));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/member-export-route.test.ts
```

Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Write the route**

Create `src/app/api/dados/[contactId]/route.ts`:

```ts
import { blockedMessage, checkDataRightsSession } from '@/lib/auth/writable';
import {
  exportFooter,
  exportHeader,
  exportMessageEntry,
  exportPrayerEntry,
} from '@/lib/member-export';
import { getChurchById } from '@/lib/repo/church-admin';
import {
  countMemberRows,
  loadMemberSubject,
  pageMessages,
  pagePrayers,
  type Cursor,
} from '@/lib/repo/member-data';

/** Art. 18 V — the member's copy, streamed.
 *
 *  NOT decoration: without maxDuration this route inherits Vercel's 10 s default
 *  and the 45 s budget below never applies, so the whole bounding design would be
 *  dead code on precisely the member with the most data. No file under src/ set
 *  maxDuration before this subsystem. */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const ROW_CEILING = 50_000;
const BUDGET_MS = 45_000;

function parseCursor(raw: string | null): { collection: 'mensagens' | 'oracoes'; cursor: Cursor } | null {
  if (!raw) return null;
  // <colecao>:<iso>,<uuid> — neither half is personal data: the id is a
  // defaultRandom() UUID identifying a row, not a person, and it is the same class
  // of value as the contactId already in the path.
  const m = /^(mensagens|oracoes):(.+),([0-9a-f-]{36})$/.exec(raw);
  if (!m) return null;
  const at = new Date(m[2]);
  if (Number.isNaN(at.getTime())) return null;
  return { collection: m[1] as 'mensagens' | 'oracoes', cursor: { createdAt: at, id: m[3] } };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> },
): Promise<Response> {
  const { contactId } = await params;

  // The non-redirecting guard: a route that let NEXT_REDIRECT escape would
  // serialise a framework control-flow signal into its own JSON body.
  const session = await checkDataRightsSession();
  if ('blocked' in session) {
    return Response.json(
      { error: blockedMessage(session.blocked) },
      { status: session.blocked === 'unauthenticated' ? 401 : 403 },
    );
  }
  const { churchId } = session;

  const contact = await loadMemberSubject(churchId, contactId);
  if (!contact) return Response.json({ error: 'Conversa não encontrada.' }, { status: 404 });

  const [counts, church] = await Promise.all([
    countMemberRows(churchId, contactId),
    getChurchById(churchId),
  ]);

  const resume = parseCursor(new URL(request.url).searchParams.get('apos'));
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(s));
      let truncatedAt: Date | null = null;
      let continuation: string | null = null;

      try {
        const header = exportHeader({
          churchName: church?.name ?? '',
          contact,
          counts: { messages: counts.messages, prayers: counts.prayers },
          now: new Date(),
        });
        // Written by hand rather than JSON.stringify'ing the whole document: the
        // whole point is that no page is ever all in memory at once.
        write(`{${JSON.stringify('gerado_em').slice(0)}:${JSON.stringify(header.gerado_em)}`);
        write(`,"igreja":${JSON.stringify(header.igreja)}`);
        write(`,"titular":${JSON.stringify(header.titular)}`);

        /** One collection, paged. Returns the cursor it stopped at, or null if it
         *  ran to completion. */
        async function drain<T extends { id: string; createdAt: Date }>(
          key: string,
          load: (after: Cursor | null, limit: number) => Promise<T[]>,
          entry: (row: T) => unknown,
          from: Cursor | null,
          skip: boolean,
        ): Promise<Cursor | null> {
          write(`,"${key}":[`);
          if (skip) { write(']'); return null; }

          let after = from;
          let emitted = 0;
          let first = true;
          for (;;) {
            const rows = await load(after, PAGE_SIZE);
            for (const row of rows) {
              if (!first) write(',');
              write(JSON.stringify(entry(row)));
              first = false;
              emitted += 1;
              after = { createdAt: row.createdAt, id: row.id };
            }
            // Bounded by BOTH: rows, and wall clock. The ceiling is predictable
            // from a count; the budget is not, which is why the resume point is
            // written into the file rather than guessed by the panel.
            if (rows.length < PAGE_SIZE) { write(']'); return null; }
            if (emitted >= ROW_CEILING || Date.now() - startedAt > BUDGET_MS) {
              write(']');
              return after;
            }
          }
        }

        // Messages first, then prayers — so truncation is either mid-messages
        // (prayers not started) or mid-prayers (messages complete). One truncation
        // point, therefore one cursor.
        const resumingPrayers = resume?.collection === 'oracoes';
        const stoppedMessages = await drain(
          'mensagens',
          (after, limit) => pageMessages(churchId, contactId, after, limit),
          exportMessageEntry,
          resume?.collection === 'mensagens' ? resume.cursor : null,
          resumingPrayers,
        );
        if (stoppedMessages) {
          truncatedAt = stoppedMessages.createdAt;
          continuation = `mensagens:${stoppedMessages.createdAt.toISOString()},${stoppedMessages.id}`;
          write(`,"pedidos_de_oracao":[]`);
        } else {
          const stoppedPrayers = await drain(
            'pedidos_de_oracao',
            (after, limit) => pagePrayers(churchId, contactId, after, limit),
            exportPrayerEntry,
            resumingPrayers ? resume!.cursor : null,
            false,
          );
          if (stoppedPrayers) {
            truncatedAt = stoppedPrayers.createdAt;
            continuation = `oracoes:${stoppedPrayers.createdAt.toISOString()},${stoppedPrayers.id}`;
          }
        }

        const footer = exportFooter({ truncatedAt, continuation });
        for (const [k, v] of Object.entries(footer)) write(`,${JSON.stringify(k)}:${JSON.stringify(v)}`);
        write('}');
        controller.close();
      } catch (error) {
        // A stream that has already emitted bytes cannot become a 500. Closing
        // with an explicit incomplete marker is the honest end: the panel sees
        // invalid JSON and shows the failure string rather than handing the
        // secretary a truncated file that looks complete.
        console.error('[dados] export stream failed', error);
        controller.error(error);
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      // No phone and no name: this lands in a shared secretariat's Downloads.
      'content-disposition': `attachment; filename="dados-membro-${contactId.slice(0, 6)}-${stamp}.json"`,
    },
  });
}
```

- [ ] **Step 4: Fix the header write, then run the test**

The first `write` above is deliberately awkward to draw attention to it; replace it with the plain form:

```ts
        write(`{"gerado_em":${JSON.stringify(header.gerado_em)}`);
```

```bash
npx vitest run tests/member-export-route.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Rewrite `ExportButtons.tsx` to fetch, download, and read the continuation**

```tsx
'use client';

import { useState } from 'react';

/** The route is the only party that knows where it stopped — a row ceiling is
 *  predictable, a 45 s budget is not — so the resume point is written into the
 *  file and read back here. The secretary never sees, types or pastes the cursor:
 *  they see two buttons and hand over two files.
 *
 *  The download is minted from a Blob in the secretary's own browser. Nothing is
 *  written to Vercel Blob: those URLs are public-by-URL and permanent, which is
 *  exactly why the menu-image flow works and exactly why a member export there
 *  would be a durable, unauthenticated, church-unscoped copy of the most
 *  sensitive rows in the system. */
export function ExportButtons({ contactId }: { contactId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<{ date: string; cursor: string } | null>(null);

  async function download(apos?: string) {
    setBusy(true);
    setError(null);
    try {
      const url = `/api/dados/${contactId}${apos ? `?apos=${encodeURIComponent(apos)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      const parsed = JSON.parse(text) as { aviso?: string; continuacao?: string };

      const blob = new Blob([text], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `dados-membro-${contactId.slice(0, 6)}.json`;
      a.click();
      URL.revokeObjectURL(href);

      setTruncated(
        parsed.continuacao
          ? { date: (parsed.aviso ?? '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? '', cursor: parsed.continuacao }
          : null,
      );
    } catch {
      setError('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <button
        type="button"
        onClick={() => download()}
        disabled={busy}
        className="min-h-11 w-full rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-60"
      >
        Baixar cópia dos dados (JSON)
      </button>
      <p className="mt-2 text-sm text-gray-600">
        O arquivo é gerado na hora e não fica guardado no sistema. Ele contém dados pessoais:
        entregue apenas à própria pessoa e apague do computador depois.
      </p>
      {error && <p className="mt-2 text-sm text-red-800">{error}</p>}
      {truncated && (
        <div className="mt-3">
          <p className="text-sm text-gray-800">
            O arquivo ficou grande demais e foi até {truncated.date}. Baixe o restante no botão
            abaixo e entregue os dois arquivos à pessoa.
          </p>
          <button
            type="button"
            onClick={() => download(truncated.cursor)}
            disabled={busy}
            className="mt-2 min-h-11 w-full rounded border border-blue-700 px-4 py-2 text-blue-700 disabled:opacity-60"
          >
            Baixar o restante (a partir de {truncated.date})
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Typecheck and run the full suite**

```bash
npm run typecheck && npx vitest run --maxWorkers=4
```

Expected: clean and green.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/dados" "src/app/admin/(protected)/caixa/[contactId]/dados/ExportButtons.tsx" tests/member-export-route.test.ts
git commit -m "feat(lgpd): a copy that streams, bounds itself, and says so when it stops"
```

---

### Task 11: The 30-day prayer warning, its export, and the guard allowlist test

**Files:**
- Modify: `src/lib/repo/prayer-admin.ts`
- Create: `src/app/api/dados/oracoes-expirando/route.ts`
- Create: `src/app/admin/(protected)/oracao/ExpiringWarning.tsx`
- Modify: `src/app/admin/(protected)/oracao/page.tsx`
- Modify: `tests/privilege-boundary.test.ts` (the allowlist test)
- Create: `tests/expiring-prayers.test.ts`

**Interfaces:**
- Produces, from `@/lib/repo/prayer-admin`: `countExpiringPrayers(churchId, before): Promise<number>`, `pageExpiringPrayers(churchId, before, after, limit): Promise<ExpiringPrayerRow[]>`, and `contactId` added to `PrayerRequestWithContact`.

**The warning is a courtesy, not a consent gate.** Nothing about the purge is conditional on the export. The cron route does not check whether a warning was displayed, does not check whether a file was downloaded, and has no field it could check with. The panel says this in so many words rather than leaving it to be discovered.

**Rendered only when the count is greater than ZERO**, in both places. A permanent "0 pedidos vão ser apagados" line is the 90-day failure in another form: a banner that is always on stops being read within a month.

**Why the window is 30 days.** The only channel this product has is the panel — there is no secretary email on file and this design refuses to add a notification channel. 7 days dies to one holiday. 90 days makes the banner permanent and therefore invisible. 30 clears one monthly cycle with room for a two-week absence, and is short enough that the window is frequently empty for a normal-volume church, so the banner appearing still means something. **The load-bearing assumption — that a secretary opens the panel at least monthly — is unobserved; no church has used this product yet.**

**⚠ The allowlist test can only be written now**, because it asserts the set of data-rights callers is **exactly three** and this task creates the third. Written any earlier it fails on day one.

- [ ] **Step 1: Write the failing test**

Create `tests/expiring-prayers.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__expiringClient = client;
  return { db: drizzle(client, { schema }) };
});

import { countExpiringPrayers, pageExpiringPrayers } from '@/lib/repo/prayer-admin';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
// retentionCutoff(now) + 30 days — the set the next 30 days of purges destroys.
const BEFORE = new Date('2025-09-10T06:00:00.000Z');
let client: PGlite;
let churchA: string;
let churchB: string;

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__expiringClient as PGlite;
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
  churchA = await mk('Igreja A');
  churchB = await mk('Igreja B');

  for (const [churchId, phone] of [[churchA, '5511111111111'], [churchB, '5522222222222']] as const) {
    const ct = await client.query<{ id: string }>(
      `insert into contact (church_id,phone,name) values ($1,$2,'Dona Cida') returning id`,
      [churchId, phone],
    );
    await client.query(
      `insert into prayer_request (church_id,contact_id,text,created_at) values
        ($1,$2,'onze meses','2025-09-01T00:00:00Z'),
        ($1,$2,'onze e meio','2025-08-20T00:00:00Z'),
        ($1,$2,'seis meses','2026-02-01T00:00:00Z')`,
      [churchId, ct.rows[0].id],
    );
  }
});

describe('countExpiringPrayers', () => {
  it('counts only prayers inside the 30-day window', async () => {
    expect(await countExpiringPrayers(churchA, BEFORE)).toBe(2);
  });

  it('is church-scoped', async () => {
    // Each church has its own two; neither sees four.
    expect(await countExpiringPrayers(churchB, BEFORE)).toBe(2);
  });

  it('returns 0 for a church with none — the warning then renders nothing at all', async () => {
    const c = await client.query<{ id: string }>(
      `insert into church (name,greeting_text,menu_header_text,menu_button_label,fallback_text,
         unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
       values ('Igreja Vazia','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    );
    expect(await countExpiringPrayers(c.rows[0].id, BEFORE)).toBe(0);
  });
});

describe('pageExpiringPrayers', () => {
  it('carries nome and whatsapp — an unattributed prayer is pastorally worthless', async () => {
    // This makes the file the single most sensitive artifact the subsystem
    // produces, which is why the panel copy says so in as many words.
    const rows = await pageExpiringPrayers(churchA, BEFORE, null, 100);
    expect(rows).toHaveLength(2);
    expect(rows[0].contactName).toBe('Dona Cida');
    expect(rows[0].contactPhone).toBe('5511111111111');
  });

  it('never returns another church\'s prayers', async () => {
    const rows = await pageExpiringPrayers(churchA, BEFORE, null, 100);
    expect(rows.every((r) => r.contactPhone === '5511111111111')).toBe(true);
  });

  it('pages by keyset ascending', async () => {
    const first = await pageExpiringPrayers(churchA, BEFORE, null, 1);
    expect(first).toHaveLength(1);
    const second = await pageExpiringPrayers(
      churchA, BEFORE, { createdAt: first[0].createdAt, id: first[0].id }, 10,
    );
    expect(second).toHaveLength(1);
    expect(second[0].id).not.toBe(first[0].id);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/expiring-prayers.test.ts
```

Expected: FAIL — `countExpiringPrayers is not a function`.

- [ ] **Step 3: Extend `src/lib/repo/prayer-admin.ts`**

Add `contactId` to the interface and its select (needed for the "Ver dados desta pessoa" link), then append the two new functions:

```ts
export interface PrayerRequestWithContact {
  id: string;
  text: string;
  status: 'novo' | 'orado';
  createdAt: Date;
  /** Needed so the prayer list can link to the member data page. Not exposed
   *  before this subsystem. */
  contactId: string;
  contactName: string | null;
  contactPhone: string;
}
```

In `listPrayerRequests`'s select object, add `contactId: prayerRequest.contactId,`.

Then append:

```ts
export interface ExpiringPrayerRow {
  id: string;
  text: string;
  status: 'novo' | 'orado';
  createdAt: Date;
  contactName: string | null;
  contactPhone: string;
}

/** How many prayer requests the next 30 days of purges will destroy.
 *
 *  `before` is retentionCutoff(now) + 30 days, computed by the caller so this
 *  function stays a query and the window stays a product decision in one place. */
export async function countExpiringPrayers(churchId: string, before: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(prayerRequest)
    .where(and(eq(prayerRequest.churchId, churchId), lt(prayerRequest.createdAt, before)));
  return row?.n ?? 0;
}

/** Exactly the set the warning counts — not the church's whole prayer archive.
 *  A full archive is a whole-church backup, which is out of scope on its own risk
 *  grounds; a warning-driven export should hand over the thing about to be lost
 *  and nothing else.
 *
 *  The join is church-scoped on BOTH predicates, like listPrayerRequests: matching
 *  on contactId alone would render another church's member name and phone number
 *  if a row's church_id and contact_id ever disagreed. */
export async function pageExpiringPrayers(
  churchId: string,
  before: Date,
  after: { createdAt: Date; id: string } | null,
  limit: number,
): Promise<ExpiringPrayerRow[]> {
  return db
    .select({
      id: prayerRequest.id,
      text: prayerRequest.text,
      status: prayerRequest.status,
      createdAt: prayerRequest.createdAt,
      contactName: contact.name,
      contactPhone: contact.phone,
    })
    .from(prayerRequest)
    .innerJoin(contact, and(eq(prayerRequest.contactId, contact.id), eq(contact.churchId, churchId)))
    .where(and(
      eq(prayerRequest.churchId, churchId),
      lt(prayerRequest.createdAt, before),
      after
        ? or(
            gt(prayerRequest.createdAt, after.createdAt),
            and(eq(prayerRequest.createdAt, after.createdAt), gt(prayerRequest.id, after.id)),
          )
        : undefined,
    ))
    .orderBy(asc(prayerRequest.createdAt), asc(prayerRequest.id))
    .limit(limit);
}
```

Update the import line to `import { and, asc, count, desc, eq, gt, lt, or } from 'drizzle-orm';`.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/expiring-prayers.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the expiring-prayers export route**

Create `src/app/api/dados/oracoes-expirando/route.ts` — the same stream/keyset/budget shape as the member export, church-scoped rather than contact-scoped:

```ts
import { blockedMessage, checkDataRightsSession } from '@/lib/auth/writable';
import { EXPIRING_WINDOW_MS } from '@/lib/expiring-window';
import { exportFooter, truncationNotice } from '@/lib/member-export';
import { retentionCutoff } from '@/lib/retention';
import { getChurchById } from '@/lib/repo/church-admin';
import { pageExpiringPrayers } from '@/lib/repo/prayer-admin';

/** The export offered beside the 30-day warning. THIRD and last caller of
 *  checkDataRightsSession — a fourth fails tests/privilege-boundary.test.ts.
 *
 *  Grants no new reading power: the Oração page already shows a suspended church
 *  every prayer request it holds. */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const ROW_CEILING = 50_000;
const BUDGET_MS = 45_000;

export async function GET(request: Request): Promise<Response> {
  const session = await checkDataRightsSession();
  if ('blocked' in session) {
    return Response.json(
      { error: blockedMessage(session.blocked) },
      { status: session.blocked === 'unauthenticated' ? 401 : 403 },
    );
  }
  const { churchId } = session;

  const now = new Date();
  const before = new Date(retentionCutoff(now).getTime() + EXPIRING_WINDOW_MS);
  const church = await getChurchById(churchId);

  const raw = new URL(request.url).searchParams.get('apos');
  const m = raw ? /^oracoes:(.+),([0-9a-f-]{36})$/.exec(raw) : null;
  const resume = m && !Number.isNaN(new Date(m[1]).getTime())
    ? { createdAt: new Date(m[1]), id: m[2] }
    : null;

  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        write(`{"gerado_em":${JSON.stringify(now.toISOString())}`);
        write(`,"igreja":${JSON.stringify(church?.name ?? '')}`);
        write(`,"pedidos_de_oracao":[`);

        let after = resume;
        let emitted = 0;
        let first = true;
        let stopped: { createdAt: Date; id: string } | null = null;

        for (;;) {
          const rows = await pageExpiringPrayers(churchId, before, after, PAGE_SIZE);
          for (const row of rows) {
            if (!first) write(',');
            // nome and whatsapp are INCLUDED here, unlike the member export: this
            // file goes to the controller, not to a member, and a prayer request
            // the church cannot attach to a person is pastorally worthless.
            write(JSON.stringify({
              quando: row.createdAt.toISOString(),
              situacao: row.status,
              texto: row.text,
              nome: row.contactName,
              whatsapp: row.contactPhone,
            }));
            first = false;
            emitted += 1;
            after = { createdAt: row.createdAt, id: row.id };
          }
          if (rows.length < PAGE_SIZE) break;
          if (emitted >= ROW_CEILING || Date.now() - startedAt > BUDGET_MS) { stopped = after; break; }
        }
        write(']');

        const footer = exportFooter({
          truncatedAt: stopped ? stopped.createdAt : null,
          continuation: stopped ? `oracoes:${stopped.createdAt.toISOString()},${stopped.id}` : null,
        });
        for (const [k, v] of Object.entries(footer)) write(`,${JSON.stringify(k)}:${JSON.stringify(v)}`);
        write('}');
        controller.close();
      } catch (error) {
        console.error('[dados] expiring-prayers stream failed', error);
        controller.error(error);
      }
    },
  });

  const stamp = now.toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="pedidos-de-oracao-a-expirar-${stamp}.json"`,
    },
  });
}
```

Note the unused `truncationNotice` import — remove it; `exportFooter` already builds the `aviso`.

- [ ] **Step 6: Create the shared window constant**

Create `src/lib/expiring-window.ts`:

```ts
/** How long before the purge a church is warned about expiring prayer requests.
 *
 *  30 days, chosen against the only channel this product has — the panel. There is
 *  no secretary email on file and this design refuses to add a notification
 *  channel, so a warning delivered by a passive channel has to survive the
 *  reader's absence:
 *
 *   - 7 days is defeated by one holiday. A courtesy nobody can receive is not one.
 *   - 90 days makes the banner permanent, and a banner that is always on stops
 *     being read within a month. The failure mode is not missing one warning, it
 *     is the church no longer seeing warnings at all.
 *   - 30 days clears one full monthly cycle with room for a two-week absence, and
 *     is short enough that the window is frequently EMPTY for a normal-volume
 *     church — so the banner appearing still means something.
 *
 *  The load-bearing assumption is that a secretary opens the panel at least
 *  monthly. Nobody has observed that; no church has used this product yet. If real
 *  usage is quarterly, this number is what changes — not the purge. */
export const EXPIRING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
```

- [ ] **Step 7: Write the warning component**

Create `src/app/admin/(protected)/oracao/ExpiringWarning.tsx`:

```tsx
'use client';

import { useState } from 'react';

/** Rendered ONLY when count > 0. There is deliberately no empty state: a standing
 *  "0 pedidos vão ser apagados" line is the 90-day failure in another form. */
export function ExpiringWarning({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<{ date: string; cursor: string } | null>(null);

  if (count <= 0) return null;

  async function download(apos?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dados/oracoes-expirando${apos ? `?apos=${encodeURIComponent(apos)}` : ''}`);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      const parsed = JSON.parse(text) as { aviso?: string; continuacao?: string };
      const href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = href;
      a.download = 'pedidos-de-oracao-a-expirar.json';
      a.click();
      URL.revokeObjectURL(href);
      setTruncated(parsed.continuacao
        ? { date: (parsed.aviso ?? '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? '', cursor: parsed.continuacao }
        : null);
    } catch {
      setError('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-900">Pedidos de oração que serão apagados em breve</h2>
      <p className="mt-2 text-sm text-amber-900">
        {count} pedido(s) de oração completam 12 meses nos próximos 30 dias e serão apagados
        automaticamente. Se a igreja quiser guardar esse histórico, baixe a cópia antes — depois
        de apagados não há como recuperar.
      </p>
      <p className="mt-2 text-sm font-medium text-amber-900">
        A limpeza acontece mesmo que ninguém baixe o arquivo. Este aviso é uma cortesia, não um
        pedido de autorização.
      </p>
      <button
        type="button"
        onClick={() => download()}
        disabled={busy}
        className="mt-3 min-h-11 w-full rounded bg-amber-700 px-4 py-2 text-white disabled:opacity-60"
      >
        Baixar os pedidos que serão apagados (JSON)
      </button>
      <p className="mt-2 text-sm text-amber-900">
        O arquivo traz o nome e o número de quem fez cada pedido, junto com o texto. É o arquivo
        mais sensível do sistema: guarde em lugar seguro e não compartilhe fora da equipe.
      </p>
      {error && <p className="mt-2 text-sm text-red-800">{error}</p>}
      {truncated && (
        <div className="mt-3">
          <p className="text-sm text-amber-900">
            O arquivo ficou grande demais e foi até {truncated.date}. Baixe o restante no botão
            abaixo e guarde os dois arquivos.
          </p>
          <button
            type="button"
            onClick={() => download(truncated.cursor)}
            disabled={busy}
            className="mt-2 min-h-11 w-full rounded border border-amber-700 px-4 py-2 text-amber-900 disabled:opacity-60"
          >
            Baixar o restante (a partir de {truncated.date})
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 8: Wire the warning and the per-row link into the Oração page**

In `src/app/admin/(protected)/oracao/page.tsx`, after the existing `requireReadableSession()` call add:

```tsx
  const expiringBefore = new Date(retentionCutoff(new Date()).getTime() + EXPIRING_WINDOW_MS);
  const expiring = await countExpiringPrayers(churchId, expiringBefore);
```

Render `<ExpiringWarning count={expiring} />` at the top of the page body, and add a link to each prayer row:

```tsx
        <Link href={`/admin/caixa/${p.contactId}/dados`} className="text-sm text-blue-700 underline">
          Ver dados desta pessoa
        </Link>
```

Imports to add: `Link` from `next/link`, `retentionCutoff` from `@/lib/retention`, `EXPIRING_WINDOW_MS` from `@/lib/expiring-window`, `countExpiringPrayers` from `@/lib/repo/prayer-admin`, `ExpiringWarning` from `./ExpiringWarning`.

- [ ] **Step 9: Add the data-rights guard allowlist test**

Append to `tests/privilege-boundary.test.ts`:

```ts
/** The claim "exactly three entry points may skip the suspension check", made
 *  enforceable. Erasure is the ONE WRITE a suspended church can perform; that
 *  exemption must not spread by copy-paste. */
describe('data-rights guard allowlist', () => {
  /** The module that DEFINES the two guards. Excluded because walk() scans
   *  src/lib and the amendment removed walk()'s skip: the definition site names
   *  both guards and is not a caller. ONE EXACT PATH, so a fourth caller placed
   *  anywhere — including elsewhere in src/lib/auth/ — is still caught. */
  const DATA_RIGHTS_GUARD_MODULE = join(SRC, 'lib/auth/writable.ts');

  const DATA_RIGHTS_CALLERS = [
    join(SRC, 'app/admin/(protected)/caixa/[contactId]/dados/actions.ts'),
    join(SRC, 'app/api/dados/[contactId]/route.ts'),
    join(SRC, 'app/api/dados/oracoes-expirando/route.ts'),
  ];
  const GUARD_RE = /\b(?:require|check)DataRightsSession\b/;

  it('exactly three files call a data-rights guard', () => {
    const referencing = CHURCH_FACING_ROOTS.flatMap((d) => walk(d))
      .filter((f) => f !== DATA_RIGHTS_GUARD_MODULE)
      .filter((f) => GUARD_RE.test(readFileSync(f, 'utf8')));
    expect(referencing.slice().sort()).toEqual(DATA_RIGHTS_CALLERS.slice().sort());
  });

  it('the excluded file really is the definition site', () => {
    // A one-path exemption that quietly stopped naming the definition site would
    // silently exempt whatever real caller later sits at that path — the same
    // failure shape as the ALLOWED skip this suite removed.
    const src = readFileSync(DATA_RIGHTS_GUARD_MODULE, 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+requireDataRightsSession\b/);
    expect(src).toMatch(/export\s+async\s+function\s+checkDataRightsSession\b/);
  });

  it('the excluded file is genuinely scanned, and only filtered afterwards', () => {
    // Keeps the exclusion a fact about THIS assertion rather than a hole in the
    // scanner, so writable.ts is still checked for restricted imports.
    expect(CHURCH_FACING_ROOTS.flatMap((d) => walk(d))).toContain(DATA_RIGHTS_GUARD_MODULE);
  });
});
```

- [ ] **Step 10: Run the boundary suite and the full suite**

```bash
npx vitest run tests/privilege-boundary.test.ts && npm run typecheck && npx vitest run --maxWorkers=4
```

Expected: all green. If `exactly three files` reports a fourth, that file must be re-routed through `requireWritableSession` — do **not** add it to the list without deciding deliberately.

- [ ] **Step 11: Commit**

```bash
git add src/lib/repo/prayer-admin.ts src/lib/expiring-window.ts "src/app/api/dados/oracoes-expirando" "src/app/admin/(protected)/oracao" tests/expiring-prayers.test.ts tests/privilege-boundary.test.ts
git commit -m "feat(lgpd): warn before the prayers go, and say plainly that the warning is not a veto"
```

---

### Task 12: The "Retenção e exclusões" panel in Configurações

**Files:**
- Create: `src/app/admin/(protected)/configuracoes/RetentionPanel.tsx`
- Create: `src/app/admin/(protected)/configuracoes/verify-actions.ts`
- Modify: `src/app/admin/(protected)/configuracoes/page.tsx`
- Create: `tests/retention-panel.test.ts`

**THE DISPLAY RULE: every retention row is listed. No filter.** An earlier design hid rows whose three counts were all zero and whose status was `done`, reasoning that a church should not be shown a line reporting that nothing happened. **That reasoning inverts on the one case that matters.** Trace it: probe finds work → `pending` row opened at 0/0/0 → a 500-row `DELETE` **commits** → the function is killed before the `+500` update → six hours later the sweep flips the row to `done` at 0/0/0. Five hundred message bodies are gone, the receipt says nothing was deleted, and the filter means the church is shown **no line at all**. So the filter is removed, and an all-zero `done` row gets a suffix saying what it is.

- [ ] **Step 1: Write the failing test**

Create `tests/retention-panel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeErasureRecord } from '@/lib/erasure-copy';

const base = {
  id: 'r1', subjectContactId: null, subjectPhoneHash: null, performedByEmail: null,
  completedAt: new Date('2026-08-07T07:00:00Z'), createdAt: new Date('2026-08-07T06:00:00Z'),
};

describe('describeErasureRecord', () => {
  it('renders a completed retention run with its three counts', () => {
    expect(describeErasureRecord({
      ...base, reason: 'retention', status: 'done',
      messagesDeleted: 1240, prayersDeleted: 12, contactsDeleted: 3,
    })).toBe('07/08/2026 · Limpeza automática (12 meses) · 1240 mensagens, 12 pedidos de oração, 3 cadastros apagados');
  });

  it('renders an ALL-ZERO done retention row as interrupted, and never hides it', () => {
    // The row that exists because 500 message bodies can be destroyed while the
    // counter update never lands. Hiding it is how that becomes invisible.
    expect(describeErasureRecord({
      ...base, reason: 'retention', status: 'done',
      messagesDeleted: 0, prayersDeleted: 0, contactsDeleted: 0,
    })).toBe('07/08/2026 · Limpeza automática (12 meses) · a execução foi interrompida antes de registrar a contagem');
  });

  it('renders a subject request with the acting staff email', () => {
    expect(describeErasureRecord({
      ...base, reason: 'subject_request', status: 'done', performedByEmail: 'secretaria@igreja.org',
      messagesDeleted: 412, prayersDeleted: 3, contactsDeleted: 1,
    })).toBe('07/08/2026 · Pedido do titular · 412 mensagens, 3 pedidos de oração · por secretaria@igreja.org');
  });

  it('appends the pending suffix', () => {
    expect(describeErasureRecord({
      ...base, reason: 'retention', status: 'pending',
      messagesDeleted: 500, prayersDeleted: 0, contactsDeleted: 0,
    })).toContain(' · pendente');
  });

  it('does NOT call a pending all-zero row interrupted — it may still be running', () => {
    const line = describeErasureRecord({
      ...base, reason: 'retention', status: 'pending',
      messagesDeleted: 0, prayersDeleted: 0, contactsDeleted: 0,
    });
    expect(line).not.toContain('interrompida');
    expect(line).toContain(' · pendente');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/retention-panel.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/erasure-copy"`.

- [ ] **Step 3: Write `src/lib/erasure-copy.ts`**

```ts
import type { ErasureRecordRow } from '@/lib/repo/erasure';

/** One receipt, as the church reads it. Pure, so the display rule is testable
 *  without a database or a render. */
export function describeErasureRecord(row: ErasureRecordRow): string {
  const date = row.createdAt.toLocaleDateString('pt-BR');
  const suffix = row.status === 'pending' ? ' · pendente' : '';

  if (row.reason === 'retention') {
    // An all-zero DONE row is a real, reachable state: the batch DELETE committed
    // and the +n UPDATE never landed, then the 6-hour sweep froze it. The row is
    // LISTED, never hidden — hiding it is how 500 destroyed message bodies produce
    // no visible line at all. Only `done` earns this wording; a pending row at
    // 0/0/0 may simply still be running.
    const nothingRecorded =
      row.status === 'done' &&
      row.messagesDeleted === 0 && row.prayersDeleted === 0 && row.contactsDeleted === 0;
    if (nothingRecorded) {
      return `${date} · Limpeza automática (12 meses) · a execução foi interrompida antes de registrar a contagem`;
    }
    return `${date} · Limpeza automática (12 meses) · ${row.messagesDeleted} mensagens, ${row.prayersDeleted} pedidos de oração, ${row.contactsDeleted} cadastros apagados${suffix}`;
  }

  const by = row.performedByEmail ? ` · por ${row.performedByEmail}` : '';
  return `${date} · Pedido do titular · ${row.messagesDeleted} mensagens, ${row.prayersDeleted} pedidos de oração${by}${suffix}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/retention-panel.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the verification action**

Create `src/app/admin/(protected)/configuracoes/verify-actions.ts`:

```ts
'use server';

import { requireReadableSession } from '@/lib/auth/writable';
import { hashPhone } from '@/lib/erasure-hash';
import { findErasureByPhoneHash } from '@/lib/repo/erasure';

export type VerifyResult = { message: string };

/** "Sim, o número X foi apagado em 12/03" — the proof that works for the returning
 *  member, not just for the regulator.
 *
 *  Uses requireReadableSession, not a data-rights guard: this is a READ of the
 *  church's own audit log and grants no new power. It is not one of the three
 *  suspension-exempt entry points. */
export async function verifyErasure(_prev: VerifyResult, formData: FormData): Promise<VerifyResult> {
  const { churchId } = await requireReadableSession();

  const hash = hashPhone(String(formData.get('phone') ?? ''));
  if (!hash) return { message: 'A verificação não está disponível nesta instalação.' };

  const found = await findErasureByPhoneHash(churchId, hash);
  if (!found) return { message: 'Nenhuma exclusão registrada para este número.' };

  return {
    message: `Sim. Os dados deste número foram apagados em ${found.createdAt.toLocaleDateString('pt-BR')}.`,
  };
}
```

- [ ] **Step 6: Write the panel**

Create `src/app/admin/(protected)/configuracoes/RetentionPanel.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { verifyErasure, type VerifyResult } from './verify-actions';

export function RetentionPanel({ lines }: { lines: string[] }) {
  const [state, action, pending] = useActionState<VerifyResult, FormData>(verifyErasure, { message: '' });

  return (
    <section className="rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Retenção e exclusões</h2>
      <p className="mt-2 text-sm text-gray-700">
        As conversas e os pedidos de oração são apagados automaticamente após 12 meses.
        A limpeza roda todos os dias de madrugada.
      </p>

      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-gray-600">Nenhuma exclusão registrada ainda.</p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {lines.map((line) => (
            <li key={line} className="break-words text-gray-800">{line}</li>
          ))}
        </ul>
      )}

      <form action={action} className="mt-5 border-t pt-4">
        <h3 className="font-medium">Verificar uma exclusão</h3>
        <label htmlFor="phone" className="mt-2 block text-sm">Número de WhatsApp</label>
        <input id="phone" name="phone" inputMode="tel" className="mt-1 w-full min-h-11 rounded border px-3 py-2" />
        <button
          type="submit"
          disabled={pending}
          className="mt-2 min-h-11 rounded border border-blue-700 px-4 py-2 text-blue-700 disabled:opacity-60"
        >
          Verificar
        </button>
        <p className="mt-2 text-xs text-gray-600">
          O número apagado não fica guardado. A verificação usa uma impressão digital (hash) do número.
        </p>
        {state.message && <p className="mt-2 text-sm text-gray-900">{state.message}</p>}
      </form>
    </section>
  );
}
```

- [ ] **Step 7: Wire it into Configurações**

In `src/app/admin/(protected)/configuracoes/page.tsx`, after the existing guard call:

```tsx
  const records = await listErasureRecords(churchId, 50);
  const lines = records.map(describeErasureRecord);

  const expiringBefore = new Date(retentionCutoff(new Date()).getTime() + EXPIRING_WINDOW_MS);
  const expiring = await countExpiringPrayers(churchId, expiringBefore);
```

Render, in the page body:

```tsx
      <ExpiringWarning count={expiring} />
      <RetentionPanel lines={lines} />
```

Imports: `listErasureRecords` from `@/lib/repo/erasure`, `describeErasureRecord` from `@/lib/erasure-copy`, `retentionCutoff`, `EXPIRING_WINDOW_MS`, `countExpiringPrayers`, `RetentionPanel` from `./RetentionPanel`, and `ExpiringWarning` from `../oracao/ExpiringWarning`.

- [ ] **Step 8: Typecheck and run the suite**

```bash
npm run typecheck && npx vitest run --maxWorkers=4
```

Expected: clean and green.

- [ ] **Step 9: Commit**

```bash
git add "src/app/admin/(protected)/configuracoes" src/lib/erasure-copy.ts tests/retention-panel.test.ts
git commit -m "feat(lgpd): list the receipt that says nothing happened, because that is the one that matters"
```

---

### Task 13: The vendor-facing erasure signal in `/owner`

**Files:**
- Modify: `src/lib/repo/platform.ts`
- Modify: `src/app/owner/(protected)/page.tsx`
- Create: `tests/erasure-signal.test.ts`

**Interfaces:**
- Produces, from `@/lib/repo/platform`: `listErasureSignals(limit?: number): Promise<ErasureSignal[]>`.

**No new table, no new column, no new write.** The signal is already being written — `erasure_record` carries church, reason, status, timestamps and counts on every erasure, minted *before* the delete. **What was missing is the vendor's ability to read it.** So this is a cross-church *read*, and that is the whole of it.

**Three columns that exist on the row are deliberately NOT in the projection:**

| Column | Crosses? | Why |
|---|---|---|
| `subject_phone_hash` | **No** | Pseudonymised, hence still personal data — and *testable*: anyone holding `ERASURE_HASH_SECRET` can hash a candidate number and match it. The party most likely to hold that secret is the operator running the deployment. Handing the vendor both the key and the hash is precisely the "audit trail becomes a copy of what was deleted" outcome the constraint forbids. |
| `subject_contact_id` | **No** | After the delete it correlates to nothing *without a copy of the old database* — but the operator is the one party with database access and a Neon point-in-time restore window. "Correlates to nothing" is weakest for exactly the reader this view is built for. |
| `performed_by_email` | **No** | Staff, not the member — but not needed for "an erasure occurred and for which church" either, and whether a staff email may sit in a permanent audit log is still an open owner question. Omitting it settles nothing and pre-commits nothing. |

**The projection is the mechanism and must be written as one.** `listChurches` does `db.select().from(church)` with no argument (`platform.ts:22`), which returns every column. A `select()` with no argument here would put the hash and the contact id into the object the moment anyone renders it, and **nothing would fail**. So the function selects an explicit column list, and the test asserts the returned object's **keys** — not merely that the page does not print them.

- [ ] **Step 1: Write the failing test**

Create `tests/erasure-signal.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/erasure-signal.test.ts
```

Expected: FAIL — `listErasureSignals is not a function`.

- [ ] **Step 3: Add the function to `src/lib/repo/platform.ts`**

Add `erasureRecord` to the existing `@/db/schema` import, then append:

```ts
export interface ErasureSignal {
  churchId: string;
  churchName: string;
  reason: 'subject_request' | 'retention';
  status: 'pending' | 'done';
  messagesDeleted: number;
  prayersDeleted: number;
  contactsDeleted: number;
  createdAt: Date;
  completedAt: Date | null;
}

/** The vendor's cross-church view of every erasure. OWNER-ONLY, like everything
 *  else in this module.
 *
 *  This is the other half of "a suspended church keeps a working delete button":
 *  blocking the delete is forbidden, so the control is that the destruction cannot
 *  be INVISIBLE. One erasure is a member exercising Art. 18; forty in an afternoon
 *  is a church on its way out.
 *
 *  ⚠ THE COLUMN LIST IS THE MECHANISM, NOT A STYLE CHOICE. listChurches above does
 *  db.select() with no argument and returns every column; the same here would put
 *  subject_phone_hash and subject_contact_id into the object the moment anyone
 *  renders it, and NOTHING WOULD FAIL. Three columns are deliberately absent:
 *
 *   - subject_phone_hash — pseudonymised, hence still personal data, and testable
 *     by anyone holding ERASURE_HASH_SECRET. The party most likely to hold that
 *     secret is the operator reading this view. Giving them both the key and the
 *     hash is exactly the "audit trail becomes a copy of what was deleted" outcome
 *     the owner decision forbids.
 *   - subject_contact_id — correlates to nothing WITHOUT a copy of the old
 *     database, and the operator is the one party with database access and a Neon
 *     point-in-time restore window.
 *   - performed_by_email — staff rather than subject, so not "whose data it was";
 *     but not needed for "an erasure occurred and for which church" either, and
 *     whether a staff email may sit in a permanent audit log is still open.
 *
 *  A test asserts the returned object's KEYS, because an absence check passes for
 *  any column nobody thought to name.
 *
 *  No WHERE on church_id: cross-church by design. `limit` is a display window, not
 *  a retention rule. */
export async function listErasureSignals(limit = 100): Promise<ErasureSignal[]> {
  return db
    .select({
      churchId: erasureRecord.churchId,
      churchName: church.name,
      reason: erasureRecord.reason,
      status: erasureRecord.status,
      messagesDeleted: erasureRecord.messagesDeleted,
      prayersDeleted: erasureRecord.prayersDeleted,
      contactsDeleted: erasureRecord.contactsDeleted,
      createdAt: erasureRecord.createdAt,
      completedAt: erasureRecord.completedAt,
    })
    .from(erasureRecord)
    .innerJoin(church, eq(church.id, erasureRecord.churchId))
    .orderBy(desc(erasureRecord.createdAt))
    .limit(limit);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/erasure-signal.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Render the block in `/owner`**

In `src/app/owner/(protected)/page.tsx`, fetch defensively — matching the existing pattern that keeps the console alive when one query fails:

```tsx
  let signals: Awaited<ReturnType<typeof listErasureSignals>> = [];
  try {
    signals = await listErasureSignals(100);
  } catch (error) {
    console.error('[owner] erasure signal list failed — rendering the rest:', error);
  }
```

And render beneath the church list:

```tsx
      <section className="mt-8 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Exclusões recentes</h2>
        <p className="mt-2 text-sm text-gray-700">
          Toda exclusão de dados feita por uma igreja aparece aqui, inclusive quando a assinatura
          está suspensa. Esta lista não mostra de quem eram os dados.
        </p>
        {signals.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">Nenhuma exclusão registrada.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {signals.map((s) => (
              <li key={`${s.churchId}-${s.createdAt.toISOString()}`} className="break-words">
                {s.createdAt.toLocaleDateString('pt-BR')} · {s.churchName} ·{' '}
                {s.reason === 'retention' ? 'Limpeza automática (12 meses)' : 'Pedido do titular'} ·{' '}
                {s.messagesDeleted} mensagens, {s.prayersDeleted} pedidos de oração,{' '}
                {s.contactsDeleted} cadastros
                {s.status === 'pending' ? ' · pendente' : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
```

**The church is not asked and is not warned.** Nothing in `/admin` changes: no consent step, no notice, no new string. The church's own Configurações list is a *different* view of the same table — the church sees its own rows *including* `performed_by_email` and the hash box; the vendor sees fewer columns across all churches. Neither view is derived from the other.

- [ ] **Step 6: Typecheck, run the boundary suite and the full suite**

```bash
npm run typecheck && npx vitest run --maxWorkers=4
```

Expected: green. The privilege-boundary suite must still pass — `src/app/owner/` is outside `CHURCH_FACING_ROOTS` by design, which is why it may import the platform repo directly, as it already does.

- [ ] **Step 7: Commit**

```bash
git add src/lib/repo/platform.ts "src/app/owner/(protected)/page.tsx" tests/erasure-signal.test.ts
git commit -m "feat(lgpd): a church may destroy its own records, but never invisibly"
```

---

### Task 14 ⚠ GATED ON TASK 8: The Privacidade text v2 and its rollout

> **Do not start this task until Task 8 is complete and the purge actually runs.** The new text promises *"as conversas e os pedidos de oração são apagados automaticamente após 12 meses"*. That sentence is only true once the cron exists. Shipping it earlier makes the one menu item whose job is telling members the truth about their data into the one place the product lies — which is exactly why the current wording was softened in the first place. See Global Constraint C7.

**Files:**
- Modify: `src/lib/church-defaults.ts`
- Modify: `src/app/owner/(protected)/[churchId]/actions.ts`
- Modify: `src/app/admin/(protected)/conteudo/page.tsx` (one hint)
- Create: `tests/privacy-text-v2.test.ts`

**Five changes to the current text, each with a reason:**

1. **Sharing (Art. 18 VII) is missing entirely.** It must be there — this is the gap that forces the revision.
2. **Retention names only "as conversas"** — the purge also deletes prayer requests.
3. **The consequence of deletion** — that a new message starts a new history — is not stated, and members must not believe deletion is a permanent block.
4. **The opening line is a compliance claim in members' ears.** *"Seus dados são tratados de acordo com a LGPD (Lei nº 13.709/2018)"* is a distinction real to a lawyer and invisible to a member reading it on a phone: it reads as *this is compliant*. Replaced with a sentence that only describes what follows. **The statute is no longer named in member-facing text at all** — the rights it grants are described in plain language and backed by a real button, which is more use to a member than a law's number.
5. **`_Edite este texto no painel._` is addressed to the secretary but read by members.** It goes; the guidance moves to the Conteúdo page.

**Rollout: the vendor may replace vendor-authored text, never the controller's own words.** `PRIVACY_ITEM` is a *seed* — each church holds its own editable `menu_item` row, so changing the constant updates nobody. The owner console gains a button that rewrites the row **only when its current body is byte-identical to a known previous default**.

- [ ] **Step 1: Recover every previous default body**

The current file holds one previous body; an earlier one (containing *"as conversas são apagadas após 12 meses"*) was replaced when the retention promise was withdrawn. Both must be frozen, or the rollout will refuse to update a church still carrying the older text.

```bash
git log -p --follow -- src/lib/church-defaults.ts | grep -n "apagadas após 12 meses" | head
```

Read the surrounding diff to recover the exact earlier body, character for character.

- [ ] **Step 2: Write the failing test**

Create `tests/privacy-text-v2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PRIVACY_ITEM, PRIVACY_ITEM_PREVIOUS_BODIES } from '@/lib/church-defaults';

describe('the Privacidade text v2', () => {
  const body = PRIVACY_ITEM.bodyText;

  it('names sharing — the Art. 18 VII gap that forced this revision', () => {
    expect(body).toContain('Com quem compartilhamos');
    expect(body).toContain('WhatsApp');
    expect(body).toContain('Não vendemos');
  });

  it('promises the 12-month purge for conversations AND prayer requests', () => {
    expect(body).toContain('as conversas e os pedidos de oração são apagados automaticamente após 12 meses');
  });

  it('states that deletion does not block future contact', () => {
    // Members must not believe deletion is a permanent block. It is not, and the
    // no-blocklist decision means it never will be.
    expect(body).toContain('um novo histórico começa');
  });

  it('NEVER claims LGPD compliance, and does not name the statute at all', () => {
    // The distinction between "we comply with the LGPD" and "your data is handled
    // in accordance with the LGPD" is real to a lawyer and invisible to a member
    // reading it on a phone.
    expect(body).not.toContain('LGPD');
    expect(body).not.toContain('13.709');
    expect(body.toLowerCase()).not.toContain('conformidade');
  });

  it('does not address the secretary in text members read', () => {
    expect(body).not.toContain('Edite este texto');
  });

  it('never uses the word dízimo', () => {
    expect(body.toLowerCase()).not.toContain('dízimo');
    expect(body.toLowerCase()).not.toContain('dizimo');
  });

  it('fits under the 1024-character WhatsApp image-caption cap', () => {
    // A church may attach an image to this item; past 1024 the Graph API 400s and
    // the member gets the error text instead of the privacy notice.
    expect(body.length).toBeLessThan(1024);
  });

  it('freezes every previous default so the rollout can recognise an unedited row', () => {
    expect(PRIVACY_ITEM_PREVIOUS_BODIES.length).toBeGreaterThanOrEqual(2);
    // The current body is not one of the "previous" ones.
    expect(PRIVACY_ITEM_PREVIOUS_BODIES).not.toContain(body);
    // Every frozen body is distinct — a duplicate means one was mis-transcribed.
    expect(new Set(PRIVACY_ITEM_PREVIOUS_BODIES).size).toBe(PRIVACY_ITEM_PREVIOUS_BODIES.length);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run tests/privacy-text-v2.test.ts
```

Expected: FAIL — `PRIVACY_ITEM_PREVIOUS_BODIES` is not exported.

- [ ] **Step 4: Rewrite the constant in `src/lib/church-defaults.ts`**

```ts
/** Every body this item has ever been SEEDED with, frozen.
 *
 *  PRIVACY_ITEM is a seed: each church holds its own editable menu_item row, so
 *  changing the constant updates nobody. The owner console's rollout button
 *  rewrites a church's row ONLY when its current body is byte-identical to one of
 *  these — which is the mechanism for "the vendor may replace vendor-authored
 *  text, never the controller's own words".
 *
 *  Never edit an entry here. Append when PRIVACY_ITEM.bodyText changes, and move
 *  the outgoing body in. A church still carrying an older default is otherwise
 *  invisible to the rollout and would be left on text the product no longer
 *  honours. */
export const PRIVACY_ITEM_PREVIOUS_BODIES: readonly string[] = [
  // v0 — promised a 12-month purge before anything deleted anything.
  [
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
  // v1 — the promise withdrawn, because no purge existed yet.
  [
    '*Privacidade e seus dados*',
    '',
    'Seus dados são tratados de acordo com a LGPD (Lei nº 13.709/2018).',
    '',
    '*O que guardamos:* seu número de WhatsApp, as mensagens desta conversa e, se você enviar, seu pedido de oração.',
    '',
    '*Por quê:* para responder às suas dúvidas e atender aos seus pedidos.',
    '',
    '*Por quanto tempo:* enquanto a igreja precisar deles para te atender. Você pode pedir a exclusão a qualquer momento.',
    '',
    '*Seus direitos:* você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento. Para isso, entre em contato com a secretaria da igreja.',
    '',
    '_Edite este texto no painel._',
  ].join('\n'),
];

/** The one menu item every church starts with.
 *
 *  v2. The statute is deliberately NOT named: "tratados de acordo com a LGPD"
 *  reads as "this is compliant" to a member of a church in the interior of Minas
 *  reading it on a phone, and the binding rule is that the bot never claims
 *  compliance. The rights are described in plain language instead, and backed by
 *  a real button in the panel — which is more use to a member than a law's number.
 *
 *  The retention sentence is only true because the nightly purge exists. If that
 *  job is ever removed, this sentence comes out in the SAME commit. */
export const PRIVACY_ITEM = {
  position: 1,
  label: '🔒 Privacidade',
  kind: 'content' as const,
  bodyText: [
    '*Privacidade e seus dados*',
    '',
    'Abaixo está o que a igreja guarda sobre você, por quê, por quanto tempo e com quem isso é compartilhado.',
    '',
    '*O que guardamos:* seu número de WhatsApp, seu nome no WhatsApp, as mensagens desta conversa e, se você enviar, seu pedido de oração.',
    '',
    '*Por quê:* para responder às suas dúvidas e atender aos seus pedidos.',
    '',
    '*Por quanto tempo:* as conversas e os pedidos de oração são apagados automaticamente após 12 meses.',
    '',
    '*Com quem compartilhamos:* apenas com os serviços que fazem este atendimento funcionar — o WhatsApp (Meta) e as empresas que hospedam nosso sistema. Não vendemos nem cedemos seus dados.',
    '',
    '*Seus direitos:* você pode pedir a qualquer momento uma cópia dos seus dados, a correção do seu nome ou a exclusão de tudo. Fale com a secretaria da igreja.',
    '',
    'A conversa também fica no seu aparelho e nos servidores do WhatsApp, fora do nosso controle. E se você escrever de novo depois da exclusão, um novo histórico começa.',
  ].join('\n'),
};
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
npx vitest run tests/privacy-text-v2.test.ts
```

Expected: PASS, 8 tests. If `freezes every previous default` fails, step 1's recovery was incomplete.

- [ ] **Step 6: Add the owner rollout action**

Append to `src/app/owner/(protected)/[churchId]/actions.ts` — beside the existing `seedPrivacyItem`, which it deliberately does not modify:

```ts
/** Rewrites a church's 🔒 Privacidade body to the current default, and ONLY when
 *  its current body is byte-identical to a body we once seeded.
 *
 *  A church that edited its own text is never overwritten: the vendor may replace
 *  vendor-authored text, never the controller's own words. Churches whose text was
 *  edited simply report "edited" so Rafael can call them. */
export async function updatePrivacyText(churchId: string): Promise<{ ok?: string; error?: string }> {
  await requireOwnerSession();

  const items = await listMenuItemsForAdmin(churchId);
  const item = items.find((i) => i.label === PRIVACY_ITEM.label);
  if (!item) return { error: 'Esta igreja não tem o item de Privacidade. Use "Recriar item de Privacidade".' };

  if (item.bodyText === PRIVACY_ITEM.bodyText) {
    return { ok: 'Esta igreja já está com o texto mais recente.' };
  }
  if (!PRIVACY_ITEM_PREVIOUS_BODIES.includes(item.bodyText)) {
    return { error: 'Esta igreja editou o próprio texto de Privacidade. Fale com ela antes de alterar.' };
  }

  try {
    await updateMenuItem(item.id, churchId, { bodyText: PRIVACY_ITEM.bodyText });
  } catch {
    return { error: 'Não foi possível atualizar o texto. Tente novamente.' };
  }
  revalidatePath(`/owner/${churchId}`);
  return { ok: 'Texto de Privacidade atualizado.' };
}
```

Render a button labelled `Atualizar texto de Privacidade` on `src/app/owner/(protected)/[churchId]/page.tsx`, surfacing the returned message.

- [ ] **Step 7: Move the editing guidance to the Conteúdo page**

In `src/app/admin/(protected)/conteudo/page.tsx`, render this hint on the Privacidade item's row (replacing the line removed from the bot text):

```tsx
        <p className="mt-1 text-xs text-gray-600">
          O item 🔒 Privacidade é o aviso que os membros leem no WhatsApp. Você pode editá-lo, mas
          mantenha o que é guardado, por quê, por quanto tempo, com quem é compartilhado e como
          pedir cópia ou exclusão.
        </p>
```

- [ ] **Step 8: Typecheck and run the full suite**

```bash
npm run typecheck && npx vitest run --maxWorkers=4
```

Expected: green. `tests/provisioning.test.ts` may assert against the old body — update those assertions to the new constant rather than pinning the literal text.

- [ ] **Step 9: Commit**

```bash
git add src/lib/church-defaults.ts "src/app/owner/(protected)/[churchId]" "src/app/admin/(protected)/conteudo/page.tsx" tests/privacy-text-v2.test.ts
git commit -m "feat(lgpd): the privacy notice can promise the purge now, because the purge exists"
```

---

### Task 15: Redaction on the two catch-all log sites

**Files:**
- Create: `src/lib/redact.ts`
- Modify: `src/app/api/whatsapp/webhook/route.ts` (one line)
- Modify: `src/app/admin/(protected)/caixa/actions.ts` (one line)
- Create: `tests/redact.test.ts`

**This is defence-in-depth, not a fix for an observed leak — and it is not a launch blocker.** `src/lib/whatsapp.ts` throws `` `Graph API ${status}: ${detail}` `` where `detail` is Meta's raw response body. Meta's `/messages` error payloads are documented to carry request context, and the recipient number is plausibly in it. **Nobody here has seen a real Graph error body** — there is no Meta app in this repository — so this guards a class of vector rather than a confirmed leak.

**Deliberately NOT applied to `webhook/route.ts:62`**, which logs Meta's `phone_number_id` — a business identifier whose redaction would destroy the one field that makes that log line useful.

- [ ] **Step 1: Write the failing test**

Create `tests/redact.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { redactError, redactPhones } from '@/lib/redact';

describe('redactPhones', () => {
  it('replaces a Brazilian mobile number', () => {
    expect(redactPhones('enviado para 5511999998888')).toBe('enviado para +55…XX');
  });

  it('replaces a number carrying a leading +', () => {
    expect(redactPhones('to=+5511999998888')).toBe('to=+55…XX');
  });

  it('leaves short digit runs alone — status codes and counts are not numbers to hide', () => {
    expect(redactPhones('Graph API 400 after 3 retries')).toBe('Graph API 400 after 3 retries');
  });

  it('replaces every occurrence, not just the first', () => {
    expect(redactPhones('de 5511999998888 para 5511777776666')).toBe('de +55…XX para +55…XX');
  });
});

describe('redactError', () => {
  it('keeps name, message and stack as TEXT while removing the digits', () => {
    // The two call sites log an Error, not a string, so redactPhones cannot be
    // applied directly. The cost of stringifying is that Vercel's log viewer no
    // longer receives a structured Error and cannot source-map it — accepted,
    // because a leaked member phone number in a log nobody purges is worse.
    const error = new Error('Graph API 400: {"error":{"message":"…5511999998888…"}}');
    const out = redactError(error);
    expect(out).toContain('Error');
    expect(out).toContain('Graph API 400');
    expect(out).not.toContain('5511999998888');
    expect(out).toContain('at ');   // the stack survived as text
  });

  it('handles a thrown non-Error without throwing itself', () => {
    // A catch-all that can itself throw turns a logged failure into an unlogged one.
    expect(redactError('só uma string 5511999998888')).not.toContain('5511999998888');
    expect(() => redactError(undefined)).not.toThrow();
    expect(() => redactError({ weird: true })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/redact.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/redact"`.

- [ ] **Step 3: Write `src/lib/redact.ts`**

```ts
/** Defence-in-depth for the runtime log, not a fix for an observed leak.
 *
 *  src/lib/whatsapp.ts throws `Graph API ${status}: ${detail}` where `detail` is
 *  Meta's raw response body. Meta's /messages error payloads are documented to
 *  carry request context and the recipient number is PLAUSIBLY in it — but there
 *  is no Meta app in this repository, so nobody here has seen a real Graph error
 *  body. This guards a class of vector; it is not a launch blocker, and its
 *  priority could drop to zero once a live app exists. */

/** 10–15 digits, optionally +-prefixed. Short runs are left alone: HTTP status
 *  codes, retry counts and row counts are not numbers worth hiding, and redacting
 *  them would make the logs useless without making them safer. */
const PHONE_RE = /\+?\d{10,15}/g;

export function redactPhones(text: string): string {
  return text.replace(PHONE_RE, '+55…XX');
}

/** The two call sites log an Error, not a string, so redactPhones cannot be
 *  applied to them directly.
 *
 *  Stringifies name + message + stack and then redacts, so the stack survives AS
 *  TEXT. The cost is real and stated: Vercel's log viewer no longer receives a
 *  structured Error object and cannot source-map it. Accepted, because a member's
 *  phone number sitting in a log with an unknown retention window is worse than a
 *  stack trace that has to be read by hand.
 *
 *  Never throws. A catch-all handler that can itself throw turns a logged failure
 *  into an unlogged one. */
export function redactError(error: unknown): string {
  try {
    if (error instanceof Error) {
      return redactPhones(`${error.name}: ${error.message}\n${error.stack ?? ''}`);
    }
    return redactPhones(typeof error === 'string' ? error : JSON.stringify(error) ?? String(error));
  } catch {
    return '[unserialisable error]';
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/redact.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Apply it at the two catch-alls**

In `src/app/api/whatsapp/webhook/route.ts`, change the catch-block log:

```ts
    console.error('Webhook processing failed', redactError(error));
```

In `src/app/admin/(protected)/caixa/actions.ts`, the equivalent line:

```ts
    console.error('Reply failed', redactError(error));
```

Add `import { redactError } from '@/lib/redact';` to both.

**Do not touch `webhook/route.ts:62`** — it logs Meta's `phone_number_id`, a business identifier, and redacting it destroys the one field that makes that line useful.

- [ ] **Step 6: Run the webhook suites and the full suite**

```bash
npx vitest run tests/webhook-alarm.test.ts tests/webhook-suspension.test.ts && npx vitest run --maxWorkers=4
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/redact.ts src/app/api/whatsapp/webhook/route.ts "src/app/admin/(protected)/caixa/actions.ts" tests/redact.test.ts
git commit -m "fix(lgpd): a member's number must not reach a log we cannot purge"
```

---

## Final verification

After Task 15, before opening the PR:

- [ ] `npm run typecheck` — clean
- [ ] `npx vitest run --maxWorkers=4` — all green
- [ ] `npm run build` — clean
- [ ] `npm run db:check` — expected and applied migration counts agree. **The new migration must be applied to Neon before deploy**; the two most recent outages in this project were both a generated-but-unapplied migration.
- [ ] Manually confirm `ERASURE_HASH_SECRET` and `CRON_SECRET` are set in the Vercel project. `CRON_SECRET` unset means the purge refuses to run (by design, and it logs loudly); `ERASURE_HASH_SECRET` unset means erasures still work but the verification box reports itself unavailable.
- [ ] Confirm `vercel.json` reached the deploy and the cron appears in Vercel's dashboard.

**At launch this subsystem deletes nothing.** No row in the system is a year old and none will be for a year. The batching, the cursor, the slice caps and the 30-day warning are insurance for the day churches cross the boundary with a year of accumulated history.

---

## Self-Review

**1. Spec coverage.** Walked each section of the spec against the plan:

| Spec section | Task |
|---|---|
| Schema changes, indexes, env vars | 1 |
| `retention.ts`, `erasure-hash.ts` | 2 |
| `member-export.ts` three builders | 3 |
| `repo/member-data.ts` | 4 |
| `repo/erasure.ts`, the conditional INSERT | 5 |
| `writable.ts` refactor, the two guards | 6 |
| `repo/retention.ts`, counting model, fairness | 7 |
| Cron route, `vercel.json`, privilege-boundary amendment | 8 |
| Member data page, `deleteMemberData` four-shape contract | 9 |
| Export route, keyset continuation, `maxDuration` | 10 |
| Prayer warning, `oracoes-expirando`, guard allowlist test | 11 |
| Configurações panel, display rule, verify box | 12 |
| `listErasureSignals`, `/owner` block, key-set projection test | 13 |
| Privacidade v2, rollout, Conteúdo hint | 14 |
| `redact.ts` and its two sites | 15 |

**Deliberate deviations from the spec, each stated at its site:**

- **C9 — `schema.ts` already imports `index`.** The spec's edit is stale; only `sql` is new.
- **C7 is new.** The spec never states that the Privacidade text must not ship before the purge. It follows directly from the spec's own reasoning about the withdrawn 12-month promise, and without it a plan executed out of order reintroduces the defect.
- **`PRIVACY_ITEM_PREVIOUS_BODIES` is plural.** The spec names one frozen body (`PRIVACY_ITEM_V1_BODY`); there are demonstrably two previous defaults, and a single-body constant would leave churches on the older text invisible to the rollout.
- **`sweepStalePending` is split into two functions.** The spec names one; it has two windows (6 h / 15 min) and two behaviours (freeze vs. re-delete-then-complete). One function taking both would be a flag argument.
- **`EXPIRING_WINDOW_MS` is its own module.** The spec leaves the 30-day constant unhomed; it is read by two pages and one route.

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Two intentional stubs, both explicitly replaced later: `ExportButtons` (Task 9 → Task 10) and the awkward header `write` (Task 10 Step 3 → Step 4).

**3. Type consistency.** `Cursor { createdAt, id }` is used identically in Tasks 4, 10 and 11. `ErasureRecordRow` (Task 5) is what `describeErasureRecord` (Task 12) consumes. `ExportMessageRow`/`ExportPrayerRow` (Task 3) are what `pageMessages`/`pagePrayers` (Task 4) return and what the builders take. `PurgeDelta` names all three counters in both Task 7 and the Task 8 call sites. `DeleteResult`'s four shapes are identical in the contract, the action and the form.

**One risk I could not close from here:** whether `drizzle-kit generate` emits the partial-index `WHERE` and the `coalesce` expression index correctly. Task 1 Step 6 makes both a read-the-diff item, and the dropped `WHERE` fails a test — but **a wrong expression index fails no correctness test**. That asymmetry is called out at the step rather than hidden.

