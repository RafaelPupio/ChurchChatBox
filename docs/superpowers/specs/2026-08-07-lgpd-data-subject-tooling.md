# Secretária Virtual — LGPD Art. 18 Data-Subject Tooling

**Design doc** · 2026-08-07 · Status: proposed · revision 3, after adversarial review, revision and re-attack — see Revisions

## Overview

A member writes to a church's WhatsApp number and asks: *"o que vocês guardam sobre mim?"*, *"me manda uma cópia"*, *"apaga tudo"*. Today the church can answer the first question by scrolling the Caixa de Entrada, and cannot answer the other two at all — there is no export, no delete, and nothing that ever removes old data. The 🔒 Privacidade item already promises members that *"as conversas são apagadas após 12 meses"* (`src/lib/church-defaults.ts:40`), and nothing in the codebase makes that true.

This subsystem builds the tooling that turns those promises into mechanisms, and it does it under two constraints already settled by the owner:

- **The church secretary performs deletions from the panel.** A member asks the church; staff act. There is no member-initiated delete command in the bot, and the vendor never deletes on a church's behalf.
- **Member data is auto-purged at 12 months.** The purge makes an existing promise true rather than adding a new one.
- **Prayer requests are on the same clock.** No exemption. The church is warned 30 days ahead and offered an export of exactly what is about to go, and the purge runs whether or not the export is taken.

**Done means:**

1. A panel page per member that shows exactly what the church holds about that person, downloads it as one file, corrects the name, and deletes everything — reachable in two clicks from the conversation.
2. A daily job that deletes messages, prayer requests, and idle contacts older than 12 months, for every church, fairly across churches and resumably within each.
3. A record that proves each deletion happened, which is not itself a copy of what was deleted, whose counts never overstate what was destroyed, and which is never hidden from the church for reading zero.
4. A 🔒 Privacidade text that describes what the system actually does, including sharing (Art. 18 VII), which the current text omits entirely.
5. No path anywhere that writes member data to Vercel Blob, to a log line, or to a file that outlives the request.

**Roles.** The church is the *controlador*; Rafael is the *operador* (Art. 5 VI/VII). Every decision below follows from that: the tooling gives the controller the buttons, and the operator builds the machine that never acts on member data on its own initiative — except the retention purge, which is a documented, church-visible instruction rather than a discretionary act.

**Not legal advice.** These are engineering mechanisms informed by the statute. The retention period, the audit-record lifetime, and the legal basis each church relies on need a Brazilian lawyer.

---

## Where the personal data actually is

Verified against `src/db/schema.ts`, not assumed. Re-verified against `main` during this revision — one row of the original table described a leak that has since been fixed.

| Location | Personal data | Sensitivity |
|---|---|---|
| `contact` (`schema.ts:62-77`) | `phone` (the identifier — it *is* the person), `name` (whatever WhatsApp reports as their profile name) | The mere existence of a row associates a natural person with a church → **religious conviction, Art. 5 II sensitive** |
| `message` (`schema.ts:79-91`) | `body` — free text of everything said in both directions; `wa_message_id` | Ordinary personal data, unbounded content. Media is **not** stored: the webhook writes `null` for anything that is not text or a list reply (`webhook/route.ts:88-94`) |
| `prayer_request` (`schema.ts:93-100`) | `text` — free text, written in the most confessional state the product ever puts a member in | **The most sensitive row in the database.** Routinely carries health, family, financial and religious detail — three of Art. 5 II's categories in one column |
| `admin_user` (`schema.ts:103-112`) | Church staff `email`, `name`, `password_hash` | Staff, not members. Different data subject, different flow (see Out of scope) |
| Vercel runtime logs | **A residual, unverified risk — no longer a verified leak.** See "The log exposure, restated honestly" below | Plausible, in a store neither export nor delete can reach |
| Meta / WhatsApp | The whole conversation, on Meta's servers and on the member's own handset | Outside our control entirely |
| Neon | The database at rest, plus whatever point-in-time restore window the plan provides | Deletion is not instant on backups |
| Vercel Blob | **Nothing.** Only admins upload, only menu images, and the URL is persisted on `menu_item.image_url` (`src/app/api/blob/upload/route.ts:55-56`). This must stay true — see the export decision | — |

### The log exposure, restated honestly

The original draft of this spec listed a verified cleartext phone number in the runtime logs and scheduled two fixes for it. **One of those two claims is now false and the other was never true.** Both are corrected here rather than shipped:

- **`src/lib/repo/contact.ts` no longer interpolates the phone.** It has been fixed on `main`. The throw now reads `` `Contact race condition: could not find contact after conflicted insert for churchId=${churchId}` `` (`contact.ts:55`), preceded by a seven-line comment stating exactly why the number is absent. **No fix is proposed here; there is nothing left to fix.** The original spec's bullet "drop `phone=${phone}` from the thrown message" is withdrawn.
- **The Postgres unique-violation vector was overstated.** A `contact_church_phone_uq` violation would indeed put the conflicting key *values* into the error message — but no code path can raise one. The only insert into `contact` is `findOrCreateContact`, and it carries `.onConflictDoNothing({ target: [contact.churchId, contact.phone] })` (`contact.ts:33`), which suppresses that exact conflict. The same is true of the only insert that can hit `message_wa_message_id_uq` (`repo/message.ts:22`). Neither unique index is reachable as a thrown error.

What **is** still real, and is the reason a redaction helper survives into this spec at reduced ambition:

- `src/lib/whatsapp.ts:120-123` throws `` `Graph API ${response.status}: ${detail}` `` where `detail` is Meta's raw response body. Meta's `/messages` error payloads are documented to carry request context, and the recipient number is plausibly in it. That error reaches `console.error` at **two** catch-alls: `webhook/route.ts:180` and `caixa/actions.ts:43`.
- **This is plausible, not verified.** There is no Meta app in this repository, so nobody here has seen a real Graph error body. Redaction is therefore specified as defence-in-depth against a class of vector, not as the fix for a confirmed leak, and it is **not** a launch blocker.

Two consequences the design has to carry:

- **`message.wa_message_id` is treated as personal data.** Meta's `wamid.…` values are widely reported to encode the counterpart's phone number in a base64 segment. That cannot be verified here (no Meta app, no live wamid), so the safe assumption is that it identifies the member: it is deleted with the contact and it is **excluded from the export file**, where it would add nothing for the member and would re-export an identifier.
- **Deletion is bounded by the database.** What we delete, we delete. What Meta holds, what the member's own phone holds, and what a Neon backup holds is not reachable, and the Privacidade text must say so rather than implying a completeness the product cannot deliver.

---

## Art. 18 rights and what serves each

| Right | Served by | New tooling? |
|---|---|---|
| **I — confirmação da existência de tratamento** | The member data page: "esta pessoa está cadastrada, com N mensagens e N pedidos". If the number does not appear in the Caixa de Entrada, the honest answer is "não guardamos nada sobre você" | New page (thin) |
| **II — acesso aos dados** | Same page renders every field on screen; Art. 19 II's 15-day deadline is met by a page that answers in one second | New page |
| **III — correção** | Name is editable on the member page. Message and prayer bodies are **not** editable — see decisions | New, small |
| **IV — anonimização, bloqueio ou eliminação de dados desnecessários/excessivos** | The 12-month purge, running whether or not anyone asks | New job |
| **V — portabilidade** | One JSON file, generated on request, streamed to the secretary, never stored | New route |
| **VI — eliminação** | The delete flow, one atomic cascading statement + an audit record minted by a conditional single statement | New action |
| **VII — informação sobre uso compartilhado** | Static text: it is the same answer for every member of every church. Belongs in the 🔒 Privacidade item (bot) and repeated inside the export file. **Today's Privacidade text does not mention sharing at all** — this is the gap that forces a text revision | Text only |
| **VIII/IX — consentimento** | Not applicable in the shape assumed here: the church does not process on consent, it answers people who wrote to it first. Naming the legal basis is a lawyer's job, not this document's | Out of scope |

**Correction is durable, and that is not an accident.** `findOrCreateContact` returns the existing row **untouched** when one is found (`contact.ts:20-28`), and no code path anywhere writes `contact.name` or `contact.phone` after creation — the only `update(contact)` sites write `mode`/`modeChangedAt`, `lastInboundAt`, and `greetedAt` (`contact.ts:72,79,89`; `inbox.ts:54`). A name corrected under Art. 18 III therefore survives the member's next inbound message. Had the opposite been true, the correction right would have been void within seconds of being exercised, so it is stated here rather than assumed.

---

## Decisions (and why)

| Decision | Choice | Reasoning / trade-off |
|---|---|---|
| Delete semantics | **Hard delete. No anonymisation.** | An "anonymised" thread sitting beside a phone-less contact row is trivially re-identifiable from its own contents (a prayer naming a spouse and a neighbourhood). Art. 12 only exempts data whose re-identification takes unreasonable effort. There is no analytics product that would justify keeping husks, and anonymising means several UPDATEs where deleting means one statement. |
| Atomicity of a member deletion | **One `DELETE FROM contact` statement; the FK cascades do the rest.** | `message.contact_id` and `prayer_request.contact_id` are both `ON DELETE CASCADE` (`schema.ts:82`, `schema.ts:96`). A single statement in Postgres runs in an implicit transaction, so the cascade is atomic **even though `neon-http` has no `db.transaction`**. This is the whole answer to "a multi-table delete will fail halfway": there is no multi-table delete. A half-deleted member is designed out rather than compensated for. |
| Audit record ordering | **Insert the record as `pending` → delete → mark `done`,** where the insert is a **single conditional statement** that cannot fire for an already-erased contact and cannot fire twice. | See "Erasure: the flow". The original design put an unconditional INSERT first, which a double-click turned into a phantom receipt. The fix is not a pre-check (a pre-check is TOCTOU) but two guards inside one statement: `INSERT … SELECT … FROM contact WHERE id = $1 AND church_id = $2`, plus a partial unique index on `(church_id, subject_contact_id) WHERE reason = 'subject_request'`. Zero rows inserted is a *meaningful answer*, not a failure. |
| Audit record counts | **Written at insert time, from a count taken immediately before the delete. Completion never writes counts.** | The cascade is invisible to any rowcount, so counts can only come from a pre-delete observation. Putting them on the pending row makes `completeErasureRecord(recordId, churchId)` a pure status flip — which is what lets the daily sweep complete an interrupted erasure without inventing numbers it cannot obtain (the contact row it would have counted no longer exists). A pending row's counts read "about to be deleted"; a done row's read "were deleted". |
| Audit record content | Counts, timestamps, the acting staff email, and an **HMAC of the phone** — never the phone, name, or any body text | The record must survive the data. A record that stored the number would be a phone-number list of exactly the people who asked to be erased. The HMAC (keyed by `ERASURE_HASH_SECRET`) still lets the church answer "sim, o número X foi apagado em 12/03" when the member returns. It remains *pseudonymised*, hence still personal data — retained under Art. 16 I as the accountability record Art. 6 X demands. |
| Missing `ERASURE_HASH_SECRET` | The delete **proceeds**, storing a null hash | Fails toward the member's right, mirroring `effectiveStatus`'s fail-toward-service (`src/lib/church-status.ts:13-21`). A missing operator env var must never be the reason a statutory erasure does not happen. |
| Suspension gate | **Export and delete are exempt, and delete is argued on its own terms** — see "Why a suspended church may still delete" | `requireWritableSession` blocks suspended churches (`src/lib/auth/writable.ts:29-31`). Routing data-subject actions through it would make a vendor billing dispute the reason a controller misses a statutory deadline — and the fine lands on the church, not on Rafael. |
| Blocking future contact | **No blocklist.** A deleted member who writes again is a new person | The only way to stop future processing is to keep the phone number in a blocklist — retaining the exact identifier we were asked to erase, forever. The member already holds the real control: they can stop writing, or block the number in WhatsApp. Stated plainly in the Privacidade text so nobody is misled. |
| Purge scope | Messages **and prayer requests** and idle contacts. **Settled by the owner** (`.superpowers/sdd/owner-decisions-2026-08-07.md:41-56`): prayer requests run on the same 12-month clock, with a 30-day warning and an export offered first. | This reverses the earlier spec's "prayer requests are exempt from the automatic purge" (`2026-08-06-multi-church-saas-design.md:113`). Keeping the single most sensitive column the longest is indefensible under Art. 6 III (necessity). The owner's rationale is that the argument for keeping prayers longest is the same argument for keeping them least. The warning is a **courtesy, not a consent gate** — see "Prayer requests: warned, exportable, purged anyway". No longer an open question. |
| Purge measurement | `message.created_at`, `prayer_request.created_at`, and `coalesce(contact.last_inbound_at, contact.created_at)` | `last_inbound_at` is written by a *separate statement* from the contact insert (`webhook/route.ts:80` then `:98`), so with no transactions it can legitimately be null on a real row. Coalescing to `created_at` (NOT NULL, `schema.ts:74`) means such a row still ages out instead of living forever. |
| **Purge counting model** | **Children first, guarded parent last. Every deleted row is returned by the statement that deleted it; a cascade can never fire during the purge.** | The original ordering deleted idle contacts first and let the FK cascade take their messages and prayers — and cascaded rows appear in **no** rowcount and no `RETURNING`, so the receipt understated by exactly the amount the purge did most work. The fix is structural: delete the children (including those belonging to idle contacts) first, then delete contacts under an explicit `NOT EXISTS` guard so a contact is only ever removed once it provably owns zero child rows. Not "count more carefully" — "make the uncountable case impossible". Full statements below. |
| Purge atomicity & resumability | Many small idempotent statements. **Resumable within a church by an absolute predicate; fair across churches by a persisted per-church cursor.** | The original claim "nothing needs to be persisted between runs" was true only inside one church. Across churches, an unordered list plus a wall-clock budget starves the tail. `church.retention_purged_at` is added and the loop runs least-recently-purged first, advancing the cursor when a church's slice ends whether or not it finished. A per-church slice cap stops one large church eating the whole run. |
| Retention receipt ordering | **`pending` → delete → `done`, symmetric with erasure,** with counts committed incrementally after each batch | The original wrote the retention row *after* the deletes, i.e. exactly the ordering the erasure path rejects. A transient `neon-http` failure on that insert would have destroyed a year of message bodies with zero Art. 6 X evidence and nothing to detect it. There is no asymmetry to justify; there was a bug. |
| Export storage | Generated per request, **streamed page by page**, never written to Blob, disk, or email | Vercel Blob URLs are public-by-URL and permanent — that is exactly why the menu-image flow works. A member export placed there would be a durable, unauthenticated, church-unscoped copy of the most sensitive rows in the system. The export is the one artifact where a convenience shortcut is a breach. |
| Export bounding | Keyset-paged at 1 000 rows, hard ceiling 50 000 rows per collection, 45 s wall-clock budget under a declared **`maxDuration = 60`**, and a **keyset-cursor continuation** past either limit | `neon-http` has no server-side cursors, so "stream from the database" is not available; what *is* available is keyset pagination feeding a `ReadableStream`, which bounds memory to one page. The ceiling and the budget bound time — but only if the platform lets the function live that long, which is why `maxDuration` is declared rather than inherited. Past either limit the file is complete-as-far-as-it-goes, says so in pt-BR, and carries the exact `(created_at, id)` position to resume from. Revision 2's date-granular `?desde=` is withdrawn: a date cannot name a position inside a day. |
| Export format | JSON, with **pt-BR keys** | Art. 18 V asks for an interoperable, common format; JSON is that. The keys are user-facing text handed to a Brazilian member, so the binding pt-BR rule applies to them (unlike code identifiers). The panel also renders the same content on screen, which satisfies Art. 19 §2's electronic-or-printed option without a second format. |
| Correction (III) | Name yes; message and prayer bodies no | A conversation log is a record of an event. Editing what someone said destroys the only value the record has and would let a church rewrite a member's words. The remedy for a wrong or regretted prayer request is deletion of that request, not rewriting it. |
| Deletion granularity | Whole member only. No per-message delete | Two reasons: a per-row delete cannot be made atomic against its audit record without the same machinery for a much smaller benefit, and "apague aquela mensagem" is nearly always "apague tudo". A single prayer request can be removed by deleting the member and letting them start over — stated in the panel copy. |
| Cron HTTP method | **`GET`.** `export async function GET`, plus `export const dynamic = 'force-dynamic'` and `export const maxDuration = 60` | Vercel Cron issues **GET** to the configured path. An implementer who exports only `POST` ships a 405 on a schedule — and this spec itself accepts "no in-product alarm for a dead cron", so the failure would be silent and permanent. `force-dynamic` is required because a cacheable GET on a route Vercel calls daily is a purge that runs once and then serves its own old response. |
| Cron authentication | `Authorization: Bearer $CRON_SECRET`, timing-safe compare; **refuse to run if the secret is unset** | The deliberate inversion of this codebase's fail-open habit. Every other guard fails toward service; this one guards a destructive, unauthenticated-by-default endpoint. An open `/api/cron/purge` is a delete button on the public internet. |
| Cross-church query privilege | New system-only module `src/lib/repo/retention.ts`, importable by **exactly one file**, enforced by an **importer-keyed** allowlist that keeps the module inside `walk()` | See "The privilege-boundary amendment". Adding `retention.ts` to the existing `ALLOWED` set would have *stopped it being scanned for its own imports* — opening the hole the amendment claims to close. |

### Why a suspended church may still delete — **settled**

**Owner decision, recorded 2026-08-07: a suspended church keeps a working delete button.** An Art. 18 deadline does not pause for a billing dispute between the vendor and the church. This section argued the case; it is no longer an argument seeking approval, and it has been removed from "What the owner must decide". The reasoning is kept because an implementer who does not understand *why* the delete path skips the status check is one refactor away from routing it through `requireWritableSession`.

The original spec argued the suspension exemption for **export** — "this grants no new reading power, `requireReadableSession` already lets a suspended church read every message" (verified: `writable.ts:75-84` performs no status check) — and then quietly applied the same guard to `deleteMemberData`, which is destructive, unrecoverable, and would become the **only write a suspended church can perform**. That argument does not transfer. Here is the one that is actually about deletion.

1. **It cannot be used to evade what suspension is for.** Suspension stops the *product*: sending WhatsApp messages and editing bot content, so a non-payer cannot keep serving members for free. Erasing a member confers no product value on the church — it is pure cost. There is no incentive gradient to exploit.
2. **The controller is deleting the controller's own data.** Rafael is the *operador*. Withholding a controller's delete button over a billing dispute is the operator asserting control over the controller's data, which is the wrong role in the wrong direction, and worse than the billing problem it would be leverage for.
3. **The deadline runs against the church.** Art. 18 VI plus Art. 19 II's 15 days, and the fine lands on the church. A vendor's invoice must not be the mechanism by which a controller misses a statutory deadline.
4. **The blast radius is one member, and the identity gate is unchanged.** `requireDataRightsSession` still performs the revocation re-check, so a *removed* secretary is blocked exactly as today; a *current* secretary of a suspended church is still the controller's agent. The action is one contact at a time, behind a typed `APAGAR` confirmation, scoped by the same two predicates as every other query — a suspended church cannot reach another church's rows through it.
5. **The exemption is exactly three entry points, and a test enforces it.** The only permitted callers of `requireDataRightsSession`/`checkDataRightsSession` are `deleteMemberData` (the action), `GET /api/dados/[contactId]` (the member export) and `GET /api/dados/oracoes-expirando` (the prayer-request export offered before the purge). Everything else a suspended church might want — replying to the member, editing texts, changing credentials, staff management — still goes through `requireWritableSession` and is still blocked. Revision 2 claimed "a test says so" while the Testing section contained no such test; the test is written out below under **Data-rights guard allowlist**, and it reuses the `walk()` + `importedModules()` scanner that `tests/privilege-boundary.test.ts` already runs. Until that test exists, the claim in this bullet is a design intention and nothing more.

The honest residual: a secretary of a church in a billing dispute can destroy that church's own member data. That is true of every day the church is *not* suspended too, so suspension is not the control that was preventing it.

---

## Schema changes

Migration **0004** — a new file; `0000`–`0003` are never touched. It carries one new enum pair, one new table, one new column on `church`, and five supporting indexes, each one written against a predicate that appears verbatim elsewhere in this spec. Revision 2 also listed five, but two of them could not serve the statements they were added for; the shapes below are corrected and the reasoning is in "On the indexes and these statements".

```sql
-- drizzle/0004_<generated>.sql
CREATE TYPE "erasure_reason" AS ENUM('subject_request', 'retention');
CREATE TYPE "erasure_status" AS ENUM('pending', 'done');

CREATE TABLE "erasure_record" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "church_id" uuid NOT NULL REFERENCES "church"("id") ON DELETE CASCADE,
  "reason" "erasure_reason" NOT NULL,
  "status" "erasure_status" DEFAULT 'pending' NOT NULL,
  -- Deliberately NOT a foreign key to contact: an FK would cascade this proof
  -- away together with the very row it exists to prove was deleted.
  "subject_contact_id" uuid,
  "subject_phone_hash" text,
  "performed_by_email" text,
  "messages_deleted" integer DEFAULT 0 NOT NULL,
  "prayers_deleted" integer DEFAULT 0 NOT NULL,
  "contacts_deleted" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE INDEX "erasure_record_church_created_idx"
  ON "erasure_record" ("church_id", "created_at" DESC);
CREATE INDEX "erasure_record_phone_hash_idx"
  ON "erasure_record" ("church_id", "subject_phone_hash");

-- THE guard that makes a double-click harmless. One subject-request receipt per
-- contact, enforced by Postgres rather than by a read-then-write pre-check.
-- Partial, so retention rows (subject_contact_id IS NULL) are unaffected — and
-- a unique index would have allowed unlimited NULLs anyway.
CREATE UNIQUE INDEX "erasure_record_subject_uq"
  ON "erasure_record" ("church_id", "subject_contact_id")
  WHERE "reason" = 'subject_request';

-- Round-robin cursor for the cross-church purge. System state: never rendered to
-- a church, never editable in either panel. On `church` rather than in its own
-- table so it disappears with the church for free.
ALTER TABLE "church" ADD COLUMN "retention_purged_at" timestamp with time zone;

-- Postgres does not index FK columns automatically, and today `message` and
-- `prayer_request` carry only their primary keys and the wa_message_id unique
-- index (verified in schema.ts: `message` declares only `waMessageIdUq`,
-- `prayer_request` declares no third argument at all). Each index below is
-- written to match a predicate that appears verbatim in this spec.

-- Age predicates: the purge's message/prayer cutoff, the step-0 probe, and the
-- expiring-prayers warning.
CREATE INDEX "message_church_created_idx"        ON "message" ("church_id", "created_at");
CREATE INDEX "prayer_request_church_created_idx" ON "prayer_request" ("church_id", "created_at");

-- One index per child table, serving BOTH the purge's church-scoped NOT EXISTS
-- guard (the leading pair) and the export's keyset page, whose ORDER BY is
-- (created_at, id) within one contact (all four columns). Two narrower indexes
-- would be one index more than the work needs.
CREATE INDEX "message_contact_keyset_idx"
  ON "message" ("church_id", "contact_id", "created_at", "id");
CREATE INDEX "prayer_request_contact_keyset_idx"
  ON "prayer_request" ("church_id", "contact_id", "created_at", "id");

-- An EXPRESSION index, not ("church_id", "last_inbound_at"). The idle predicate
-- is coalesce(last_inbound_at, created_at) < $cutoff, and a plain column index
-- is not sargable against a coalesce() over two columns. Revision 2 listed the
-- plain-column form, which no statement in this spec could have used.
CREATE INDEX "contact_church_idle_idx"
  ON "contact" ("church_id", (coalesce("last_inbound_at", "created_at")));
```

Column notes:

- **`church_id … ON DELETE CASCADE`** — deleting a church destroys its receipts too. Correct: with no controller there is no accountability obligation, and retaining a departed customer's compliance records is retention without purpose.
- **`subject_contact_id`** — kept without an FK so the `pending → done` resume can find its target, and so the partial unique index has something to key on. After the delete it is a random UUID that correlates to nothing without a copy of the old database. A member erased, returning, and erased again gets a **new** `contact.id` (`defaultRandom()`), so the unique index never blocks a legitimate second erasure.
- **`performed_by_email`** — a text *snapshot*, not a reference to `admin_user`. An FK with `ON DELETE SET NULL` would erase the actor from the audit trail the day that secretary leaves the church, which is precisely when the record matters. Staff email retained under Art. 16 I; a staff member cannot erase their own name from a compliance log, and that is defensible.
- **`messages_deleted` / `prayers_deleted` / `contacts_deleted`** — for a subject request, written once at insert time from the pre-delete count (`contacts_deleted` is 1). For a retention run, started at 0 and incremented after each committed batch, so a run cut short by the budget leaves a row whose numbers are *true so far* rather than absent or invented.

Drizzle addition to `src/db/schema.ts` — **and the existing import lines do change.** The original draft claimed "nothing existing is modified", which was false: `schema.ts:1-3` imports `uniqueIndex` but not `index`, and the partial-index predicate needs `sql`. Both import lines are edited:

```ts
// line 1-3, edited: `index` added
import {
  boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
// new import: schema.ts imports nothing from 'drizzle-orm' today
import { sql } from 'drizzle-orm';
```

```ts
// church: one column appended
  retentionPurgedAt: timestamp('retention_purged_at', { withTimezone: true }),
```

```ts
export const erasureReasonEnum = pgEnum('erasure_reason', ['subject_request', 'retention']);
export const erasureStatusEnum = pgEnum('erasure_status', ['pending', 'done']);

export const erasureRecord = pgTable('erasure_record', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  reason: erasureReasonEnum('reason').notNull(),
  status: erasureStatusEnum('status').notNull().default('pending'),
  subjectContactId: uuid('subject_contact_id'),
  subjectPhoneHash: text('subject_phone_hash'),
  performedByEmail: text('performed_by_email'),
  messagesDeleted: integer('messages_deleted').notNull().default(0),
  prayersDeleted: integer('prayers_deleted').notNull().default(0),
  contactsDeleted: integer('contacts_deleted').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  churchCreatedIdx: index('erasure_record_church_created_idx').on(t.churchId, t.createdAt),
  phoneHashIdx: index('erasure_record_phone_hash_idx').on(t.churchId, t.subjectPhoneHash),
  subjectUq: uniqueIndex('erasure_record_subject_uq')
    .on(t.churchId, t.subjectContactId)
    .where(sql`${t.reason} = 'subject_request'`),
}));
```

**Three existing `pgTable` definitions gain index entries.** This is a real edit to existing code, stated rather than glossed:

```ts
// message — third argument already exists (waMessageIdUq); two entries are added
  churchCreatedIdx: index('message_church_created_idx').on(t.churchId, t.createdAt),
  contactKeysetIdx: index('message_contact_keyset_idx').on(t.churchId, t.contactId, t.createdAt, t.id),

// prayer_request — has NO third argument today; one is added
}, (t) => ({
  churchCreatedIdx: index('prayer_request_church_created_idx').on(t.churchId, t.createdAt),
  contactKeysetIdx: index('prayer_request_contact_keyset_idx').on(t.churchId, t.contactId, t.createdAt, t.id),
}));

// contact — third argument already exists (churchPhoneUq); one expression entry is added
  churchIdleIdx: index('contact_church_idle_idx')
    .on(t.churchId, sql`coalesce(${t.lastInboundAt}, ${t.createdAt})`),
```

**Implementation note on the two hand-checkable index shapes.** `drizzle-kit generate` is the source of migration 0004, but the emitted SQL must be read before it is committed, in two places:

- If drizzle-kit drops the `WHERE reason = 'subject_request'` predicate, the partial index becomes total and blocks a second retention row per church, which is wrong.
- If it emits `contact_church_idle_idx` over the bare columns instead of the `coalesce(…)` expression, the index silently stops serving the idle predicate — the exact defect being fixed here.

Either is hand-restored in the migration file. The PGlite suite runs the real migration, so a dropped predicate fails a test rather than reaching production; a wrong *expression* would not fail a correctness test, so it is a read-the-diff item, and the plan should say so.

**No other schema change.** In particular there is no `blocked_at`, no `deletion_requested_at` on `contact`, and no soft-delete flag — soft deletion is not deletion.

New environment variables (`.env.example`, appended to the four already there):

```
# Keys the HMAC that lets the panel confirm "this number was erased" without
# storing the number. If unset, erasures still run and store a null hash.
ERASURE_HASH_SECRET=""

# Vercel injects this as a Bearer token on cron requests. If unset, the purge
# endpoint refuses to run — an unauthenticated delete endpoint is worse than a
# purge that does not happen.
CRON_SECRET=""
```

---

## Components, one responsibility each

**Pure (no I/O, unit-tested like `church-status.ts`):**

| Module | Responsibility |
|---|---|
| `src/lib/retention.ts` | `RETENTION_MS` (365 days) and `retentionCutoff(now: Date): Date`. Nothing else. |
| `src/lib/member-export.ts` | The export as **three pure builders**, not one: `exportHeader(church, contact, counts, now)`, `exportMessageEntry(row)` / `exportPrayerEntry(row)`, and `exportFooter({ truncatedAt })` carrying `SHARING_DISCLOSURE`, `RETENTION_NOTE` and `EXPORT_NOTES`. Takes rows, returns values; no database, no `Date.now()`. Split this way because the route streams pages and cannot hold the whole history — see "Export and portability". |
| `src/lib/erasure-hash.ts` | `hashPhone(phone: string): string \| null` — HMAC-SHA256 keyed by `ERASURE_HASH_SECRET`, `null` when the secret is absent. Normalises the number (digits only) first so the same person hashes the same way. |
| `src/lib/redact.ts` | `redactPhones(text: string): string` — replaces runs of 10–15 digits (with optional `+`) by `+55…XX`. Plus `redactError(error: unknown): string`, because the two call sites log an `Error`, not a string — see the note below. |

**Church-scoped repo (safe for the panel):**

| Module | Responsibility |
|---|---|
| `src/lib/repo/member-data.ts` | `loadMemberSubject(churchId, contactId)` → the contact row or null; `countMemberRows(churchId, contactId)` → `{ messages, prayers, prayersNovo }`; `pageMessages(churchId, contactId, after, limit)` and `pagePrayers(...)` → keyset pages for the export; `deleteMember(churchId, contactId)` → rows deleted (0 or 1); `renameContact(churchId, contactId, name)`. Every query carries both predicates, like every other repo here. |
| `src/lib/repo/erasure.ts` | `openSubjectErasure(...)` (the one conditional INSERT), `completeErasureRecord(recordId, churchId)` (**status flip and `completed_at` only — no counts parameter**), `findErasureByContact(churchId, contactId)`, `listErasureRecords(churchId, limit)`, `findErasureByPhoneHash(churchId, hash)`. Church-scoped; no cross-church query. |

**System-only repo (owner/system privilege, like `platform.ts`):**

| Module | Responsibility |
|---|---|
| `src/lib/repo/retention.ts` | `listChurchIdsForPurge()` (least-recently-purged first), `markChurchPurged(churchId, at)`, `hasPurgeWork(churchId, cutoff)`, `openRetentionRecord(churchId)`, `addRetentionCounts(recordId, churchId, delta)`, `purgeMessageBatch(churchId, cutoff, limit)`, `purgePrayerBatch(churchId, cutoff, limit)`, `purgeContactBatch(churchId, cutoff, limit)`, `completeErasureRecordSystem(recordId)`, `sweepStalePending(olderThan)`. Cross-church by construction. **Importable only by `src/app/api/cron/purge/route.ts`** — enforced by the importer-keyed amendment to `tests/privilege-boundary.test.ts` described below. |

**Entry points:**

| File | Responsibility |
|---|---|
| `src/app/admin/(protected)/caixa/[contactId]/dados/page.tsx` | The member data page. Uses `requireReadableSession` — mandatory, `tests/privilege-boundary.test.ts:121-135` fails any protected page that does not. |
| `.../dados/actions.ts` | `deleteMemberData(contactId, formData)` and `renameMember(...)`. Uses the new `requireDataRightsSession`. |
| `src/app/api/dados/[contactId]/route.ts` | GET → the member export file, as a `ReadableStream`. **Declares `export const maxDuration = 60` and `export const dynamic = 'force-dynamic'`** — without the first, Vercel's 10 s default kills the request before the 45 s budget can apply. Uses `checkDataRightsSession`, the non-redirecting variant: a route handler that let `NEXT_REDIRECT` escape would serialise a framework control-flow signal into its own body — the exact bug already fixed once at `src/app/api/blob/upload/route.ts:9-25`. |
| `src/app/api/dados/oracoes-expirando/route.ts` | GET → the expiring-prayer-requests export, same stream/keyset/budget/`maxDuration` shape, church-scoped rather than contact-scoped. Offered by the 30-day warning. Third and last caller of `checkDataRightsSession`. |
| `src/app/api/cron/purge/route.ts` | Bearer-authenticated purge runner, **exported as `GET`**. The only importer of `repo/retention.ts`. |
| `src/lib/auth/writable.ts` | Gains `requireDataRightsSession()` (actions) and `checkDataRightsSession()` (route handlers). See the refactor note below — the split is narrower than the original spec proposed, on purpose. |
| `src/app/admin/(protected)/configuracoes/page.tsx` | Gains a "Retenção e exclusões" panel: the retention statement, **every** retention and subject record (no all-zero filter — see the display rule), the hash-verification box, and the 30-day expiring-prayers warning. |
| `src/app/admin/(protected)/oracao/page.tsx` | Gains the same 30-day expiring-prayers warning at the top, rendered only when the count is greater than zero. Read-only; the guard it already uses is unchanged. |
| `src/lib/repo/prayer-admin.ts` | Gains `countExpiringPrayers(churchId, before)` and `pageExpiringPrayers(churchId, before, after, limit)`. Church-scoped like the two functions already there; no new module for a two-query feature. |
| `src/app/owner/(protected)/[churchId]/actions.ts` | Gains `updatePrivacyText(churchId)` — rewrites the 🔒 Privacidade body **only** if it is byte-identical to a previous seeded default. Sits beside the existing `seedPrivacyItem` (`actions.ts:56-83`), which it deliberately does not modify. |
| `vercel.json` | New file (none exists today). One cron entry. |

**The `writable.ts` refactor, stated precisely.** The original proposed splitting `verifyWritable` into `verifyIdentity` + a status test so "the two guards cannot drift apart", without noticing that `verifyWritable` calls `getChurchById` (`writable.ts:26-27`) and `requireReadableSession` does not (`:75-84`). Sharing a helper that included that call would silently add a church-existence redirect and one extra query to **every protected page load**. That is not intended, so:

```
verifyIdentity(session)      → findAdminById + churchId match. Nothing else.
requireReadableSession()     = verifyIdentity + redirect('/admin/login') on failure   [unchanged behaviour]
requireDataRightsSession()   = verifyIdentity + sentinel on failure                   [new]
checkDataRightsSession()     = getSession/isAuthenticated + verifyIdentity            [new]
requireWritableSession()     = verifyIdentity + getChurchById + effectiveStatus       [unchanged behaviour]
checkWritableSession()       = as today                                               [unchanged behaviour]
```

`getChurchById` stays in the writable path only. Its existence check there is in any case near-redundant: `admin_user.church_id` is `ON DELETE CASCADE` (`schema.ts:105`), so a deleted church takes its admin rows with it and `findAdminById` already returns `undefined`. Its real job is supplying `status` and `graceUntil`, which only the suspension test needs. **No read page changes behaviour.**

**One fix that belongs to this subsystem** (down from two — see "The log exposure, restated honestly"):

- `src/app/api/whatsapp/webhook/route.ts:180` and `src/app/admin/(protected)/caixa/actions.ts:43` — wrap the logged value in `redactError(...)`. `redactPhones(text: string)` cannot be applied directly: both sites log an `Error`, not a string. `redactError` stringifies as `` `${e.name}: ${e.message}\n${e.stack ?? ''}` `` and then redacts, so the stack survives **as text**; the cost is that Vercel's log viewer no longer receives a structured `Error` object and cannot source-map it. Applied to these two catch-alls **only** — not to `webhook/route.ts:62`, which logs Meta's `phone_number_id`, a business identifier whose redaction would destroy the one field that makes that log line useful. Marked defence-in-depth, not a launch blocker, because the underlying leak is plausible rather than observed.

### The privilege-boundary amendment

`tests/privilege-boundary.test.ts:40-48` walks the church-facing roots and, per the `!ALLOWED.has(full)` filter on line 45, **skips** every file in `ALLOWED`. The consequence is called out in the project's own binding constraints: adding a module to `ALLOWED` also stops that module's own imports from being scanned. Mirroring `platform.ts` by adding `repo/retention.ts` to `ALLOWED` would therefore create a cross-church module inside `src/lib/repo/` that could import `platform.ts` with nothing to catch it — opening the hole this amendment exists to close.

The amendment is an **importer-keyed** table, and `walk()` loses its skip entirely:

**The two sides of the map must be keyed differently, and getting that wrong disables the check silently.** `resolveSpecifier` ends with `target.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')` (`privilege-boundary.test.ts:58`), so `importedModules()` yields **extensionless** paths — which is exactly why the test that exists today compares against `PLATFORM_MODULE.replace(/\.tsx?$/, '')` (`:77`) and not against `PLATFORM_MODULE`. `walk()`, by contrast, yields real paths **with** `.ts`/`.tsx`. A `RESTRICTED` keyed on `'lib/repo/platform.ts'` would therefore never match anything `importedModules` returns: the amendment would pass green while enforcing nothing at all — a worse outcome than the exemption it replaces, because it would look like a guard. Keys are module bases; importer sets are walked paths:

```ts
const base = (p: string) => p.replace(/\.tsx?$/, '');

/** Modules whose privilege is bounded by WHO may import them — not by being
 *  invisible to the scanner.
 *  KEY:   the restricted module, EXTENSIONLESS — that is what importedModules() returns.
 *  VALUE: the files permitted to import it, WITH extension — that is what walk() returns.
 *  Every file here is STILL walked, so a restricted module's own imports are
 *  checked like anyone else's. */
const RESTRICTED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [base(PLATFORM_MODULE), new Set<string>()],                        // importable by nothing under the scanned roots
  [base(join(SRC, 'lib/repo/retention.ts')), new Set([join(SRC, 'app/api/cron/purge/route.ts')])],
]);

function walk(dir: string): string[] {           // the `!ALLOWED.has(full)` filter is removed
  ...
  else if (/\.tsx?$/.test(full)) out.push(full);
}
```

The assertion becomes: for every scanned file `f` and every restricted module `m` that `f` imports, fail unless `RESTRICTED.get(m)!.has(f)`. The existing `resolves alias, relative and extension-bearing specifiers` test (`privilege-boundary.test.ts:82-96`) already pins the resolver's extensionless output, so a later change to it breaks there rather than quietly emptying this map. Three properties follow, and each gets its own test:

1. `platform.ts` is importable by nothing under the scanned roots — the rule it has today, unchanged, now expressed as an empty set instead of an exemption.
2. `platform.ts` is itself scanned for the first time. Verified safe: it imports only `drizzle-orm`, `@/db/client`, `@/db/schema` and `@/lib/church-status` (`platform.ts:1-4`), none of them restricted.
3. `retention.ts` is importable only by the cron route, **and cannot import `platform.ts`**, because it is walked like every other file.

The existing `expect(files.length).toBeGreaterThan(40)` guard still holds (the set grows by one file, not shrinks). The `admin read guard` describe block reuses `walk()` and is unaffected: no restricted module lives under `src/app/admin/(protected)`.

---

## Erasure: the flow

```
Secretary opens /admin/caixa/<id>/dados
  → sees counts, reads the warnings, types APAGAR
  → deleteMemberData(contactId, formData)
```

**The contract, exactly.** The action returns one of four shapes and never throws:

```ts
type DeleteResult =
  | { ok: true; recordedAt: Date }   // erased in this call
  | { alreadyDeleted: true }         // a completed receipt already exists for this contact
  | { pending: true; since: Date }   // a receipt exists but the delete has not succeeded yet
  | { error: string };               // pt-BR, from the strings table
```

**Steps.**

1. `requireDataRightsSession()` — revocation re-checked, suspension deliberately not.
2. Confirmation: `formData.get('confirm') !== 'APAGAR'` → `{ error: 'Escreva APAGAR para confirmar.' }`. Nothing is read or written before this.
3. `loadMemberSubject(churchId, contactId)` and `countMemberRows(churchId, contactId)`. If the contact is absent, skip to step 7's lookup.
4. `hashPhone(contact.phone)` — pure, in memory, never logged.
5. **`openSubjectErasure(...)` — one statement, two guards:**

   ```sql
   INSERT INTO erasure_record
     (church_id, reason, status, subject_contact_id, subject_phone_hash,
      performed_by_email, messages_deleted, prayers_deleted, contacts_deleted)
   SELECT $churchId, 'subject_request', 'pending', c.id, $phoneHash,
          $email, $messages, $prayers, 1
     FROM contact c
    WHERE c.id = $contactId AND c.church_id = $churchId
   ON CONFLICT (church_id, subject_contact_id) WHERE reason = 'subject_request'
   DO NOTHING
   RETURNING id, created_at;
   ```

   The `FROM contact … WHERE` makes it **impossible to mint a receipt for a contact that is already gone**. The partial unique index makes it **impossible to mint a second receipt for the same contact**. Both guards are inside one statement, so both are atomic under Postgres's per-statement implicit transaction — no pre-check, no TOCTOU window. This is the direct answer to "a double-click writes a phantom receipt": the second click inserts zero rows, by the database, not by a race the application hopes to win.

6. **One row returned → this call owns the erasure.** `deleteMember(churchId, contactId)` (one `DELETE FROM contact` with `RETURNING id`, cascades, atomic), then `completeErasureRecord(recordId, churchId)`. Return `{ ok: true, recordedAt }`.

   **What if `deleteMember` returns 0 here?** It means the contact row vanished between step 5 and step 6 — which the unique index rules out for a competing erasure, so in practice only direct database access. The record is still completed: what it asserts — *this contact's data is not in the database* — is true. A `pending` row left behind would be an alarm about a state that is already correct.

7. **Zero rows returned → `findErasureByContact(churchId, contactId)` decides which of three things happened:**
   - **A `done` record exists** → the double-click, or a second secretary. `{ alreadyDeleted: true }` → *"Estes dados já haviam sido apagados."* **No second record was written.** The claim "writes no second record" is now true because the database enforces it, where before it was asserted against a flow that contradicted it.
   - **A `pending` record exists** → a previous attempt opened a receipt and failed to delete. Re-run `deleteMember` (idempotent: 0 or 1 rows) and `completeErasureRecord`. Success → `{ ok: true }`; failure → `{ pending: true, since }` → the pending banner.
   - **No record at all** → the contact does not exist for this church (wrong id, or another church's). `{ error: 'Conversa não encontrada.' }`.

**Per table, concretely:**

| Table | What happens |
|---|---|
| `contact` | Row deleted. Phone and name gone. |
| `message` | Every row for that contact deleted by the FK cascade — inbound and outbound, bodies and `wa_message_id`. |
| `prayer_request` | Every row deleted by the cascade, **including rows still marked `novo`**. The church loses prayers it has not yet prayed for; the confirmation screen says so with a count, because that is a real cost the secretary should absorb knowingly. |
| `menu_item`, `church`, `admin_user` | Untouched. No member data lives there. |
| `erasure_record` | Gains **at most one** row per contact, ever. Holds no phone, no name, no body. |

**Counts on the receipt are a pre-delete observation, and the receipt says only what that supports.** The cascade appears in no rowcount, so the numbers come from `countMemberRows` taken immediately before. Under a genuine race (the member writes in the same second) the receipt can be off by one message. That is stated in the failure table and is why the string is *"{n} mensagens, {n} pedidos de oração"* — a count of what the church held when it decided to erase — rather than a guarantee about rows the statement returned.

**In-flight conversation and the 24h window.** Deleting a contact in `human` mode removes the thread, `last_inbound_at`, and therefore the panel's ability to reply at all — `sendReplyToContact` needs a conversation row and an open window (`src/app/admin/(protected)/caixa/actions.ts:28-33`). The design does **not** block deletion for an in-flight handoff: the member's right outranks the church's convenience. It warns instead, and tells the secretary to say whatever they need to say *before* pressing the button. After deletion the church has no way to message that number from the product.

**Deletion does not stop future processing.** The next inbound message from that number recreates the contact via `findOrCreateContact` with a **new UUID** and `greeted_at = null`, so the person is greeted as a first-time contact and a fresh history begins — and, because the id is new, they can be erased again later without the unique index objecting. This is the correct behaviour under the no-blocklist decision, and both the panel copy and the Privacidade text state it.

---

## The 12-month purge

**Cutoff:** `now − 365 days`, from `src/lib/retention.ts`. Calendar-month drift is a day and does not matter; a pure constant is testable and one place to change.

### Counting: why every deleted row is countable

`DELETE … RETURNING` returns **only directly deleted rows**; rows removed by an `ON DELETE CASCADE` appear in no rowcount and no `RETURNING` set. The original ordering deleted idle contacts *first* and let the cascade take their messages and prayers, so the church-facing receipt understated by exactly the volume the purge worked hardest on: three idle contacts holding 900 messages plus 340 messages of active members were reported as "340 mensagens". Wording cannot fix that; the order of operations can.

**Children first, parent last, and the parent delete is guarded so a cascade can never fire:**

1. **Messages** — everything past the cutoff *plus* everything belonging to a contact that is about to be purged:

   ```sql
   DELETE FROM message
    WHERE id IN (
      SELECT id FROM message
       WHERE church_id = $1
         AND (created_at < $cutoff
              OR contact_id IN (SELECT id FROM contact
                                 WHERE church_id = $1
                                   AND coalesce(last_inbound_at, created_at) < $cutoff))
       LIMIT 500)
   RETURNING id;
   ```

2. **Prayer requests** — the same shape, same predicate pair.

3. **Contacts** — only after (1) and (2) have both drained (a batch returning fewer than 500), and only for contacts that provably own nothing:

   ```sql
   DELETE FROM contact
    WHERE id IN (
      SELECT id FROM contact c
       WHERE c.church_id = $1
         AND coalesce(c.last_inbound_at, c.created_at) < $cutoff
         AND NOT EXISTS (SELECT 1 FROM message        m
                          WHERE m.church_id = $1 AND m.contact_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM prayer_request p
                          WHERE p.church_id = $1 AND p.contact_id = c.id)
       LIMIT 500)
   RETURNING id;
   ```

   **`m.church_id = $1` is load-bearing and was missing in revision 2.** Without it the guard is still *correct* — `contact_id` is a UUID primary key, so a row of another church can never match — but it is no longer *seekable*: `message_contact_keyset_idx` leads with `church_id`, and a predicate that constrains only the second column cannot be used as an index seek. The previous revision added indexes and then wrote predicates those indexes could not serve. Church-scoping the guard costs nothing semantically and is the only reason the index exists.

The `NOT EXISTS` pair is what turns "the cascade *should* have nothing left" into "the cascade *cannot* fire". A member who writes in the window between step 1 and step 3 — the webhook inserts the message (`route.ts:85`) one statement before it touches `last_inbound_at` (`:98`), so their contact still matches the idle predicate for a moment — simply fails the `NOT EXISTS` and survives to the next run. Their new message is not silently cascaded away and the counts do not drift. **Every row the purge deletes is a row some statement returned.**

**On the indexes and these statements, stated at the strength the evidence supports.** Each index in migration 0004 is written to match a predicate that appears verbatim above: the age arms against `(church_id, created_at)`, the `NOT EXISTS` guards against the leading `(church_id, contact_id)` of the keyset indexes, and the idle predicate against the `coalesce` expression index. That the planner *chooses* them — in particular that it resolves the `created_at < $cutoff OR contact_id IN (…)` disjunction into a `BitmapOr` of two index scans rather than a sequential scan — is a plan-level claim, and there is no database in this repository on which to read a plan. It is listed under "What cannot be verified here" rather than asserted. What is asserted, and is checkable by reading, is the weaker and more useful property: **no predicate in this spec is now unservable by the indexes this spec adds.** Revision 2's claim that the indexes "keep these guards from being sequential scans" is withdrawn — it was false for two of the five indexes and unverifiable for the rest.

The receipt string is therefore left **verbatim** — it is now true — rather than being softened to hide a number that could not be trusted.

### Per church, per run

0. **Probe** (one statement, one round trip): does this church have anything to purge at all?

   ```sql
   SELECT EXISTS(SELECT 1 FROM message        WHERE church_id=$1 AND created_at < $cutoff)
       OR EXISTS(SELECT 1 FROM prayer_request WHERE church_id=$1 AND created_at < $cutoff)
       OR EXISTS(SELECT 1 FROM contact        WHERE church_id=$1
                  AND coalesce(last_inbound_at, created_at) < $cutoff) AS work;
   ```

   False → advance the cursor, write **no record**, move to the next church. This is what keeps "a retention row means something was actually deleted" true while still writing the row *before* the deletes.

1. **Open the receipt**: `INSERT … reason='retention', status='pending', counts 0 … RETURNING id`.
2. Run loops 1–3 above. **After each committed batch**, `UPDATE erasure_record SET messages_deleted = messages_deleted + $n WHERE id = $1 AND church_id = $2`. One extra round trip per 500 rows.
3. **Mark `done`**, set `completed_at`, set `church.retention_purged_at = now()`.

**What the counts actually guarantee — the "truthful at every instant" claim is retracted.** It was false, and the way it was false is the same shape as the bug it replaced. With no transactions, the batch `DELETE` and the `+n` `UPDATE` are two statements: the delete can commit and the function be killed before the update lands. The receipt then reports fewer rows than were destroyed. Making them one statement is possible in principle (`WITH d AS (DELETE … RETURNING id) UPDATE erasure_record SET … + (SELECT count(*) FROM d)`) but is exactly the "new machinery to close a finding" that produced this defect in the first place, and it does not remove the risk — it moves it to the *next* batch boundary.

The honest invariant, and the one the design does enforce, is one-directional:

> **A retention receipt never overstates.** `messages_deleted ≤ rows actually deleted`, always, because every increment is applied only after the delete that earned it has already committed. It can lag reality by at most one batch per table (500 rows), and it lags by more than that only if the run is killed and the row is later swept.

That is a weaker claim than revision 2 made and a stronger one than "approximately right": a church reading its receipt knows the number is a floor, never a ceiling. It also means an all-zero `done` row is a real, reachable state — which is what the display rule below has to handle.

**Why the retention path is `pending → done` like erasure, not the reverse.** The original wrote the retention row *after* the deletes, which is precisely the ordering the erasure section rejects as "the dangerous direction". A transient `neon-http` failure on that final insert would have left 1 240 message bodies destroyed with zero Art. 6 X evidence and nothing anywhere to notice. There was no asymmetry worth justifying — there was a bug, and it is fixed by making the two paths the same shape.

**Kept:** the church row and its texts, the menu, staff accounts, and the `erasure_record` history. **Purged:** everything about the member.

### Fairness across churches, and what the overrun really is

`listChurchIdsForPurge()` orders by `retention_purged_at ASC NULLS FIRST` — never-purged churches first, then least-recently-purged. The cursor is advanced **when a church's slice ends, whether or not that church finished**, which is what makes the rotation a rotation: a church with a million rows takes its slice, moves to the back of the queue, and the rest of the platform gets purged tomorrow instead of never.

**Budgets.** `maxDuration = 60` on the route. The run stops at **45 s** overall. Each church's slice is additionally capped at **10 s or 20 batches per table, whichever comes first**, so no single church can consume the whole run.

**The "one-day overrun" claim is retracted.** It was true within one church and false across the platform: with an unordered list and a global budget, the tail of a 40-church list could go days or weeks unpurged with nothing in the product saying so. The honest statement is:

> Within a church, the purge is resumable by construction — the predicate is absolute time, not a cursor, so a run cut short leaves the remainder for the next run and running twice deletes nothing the second time. **Across churches, resumability is a persisted cursor**, and the worst-case retention overrun is one full rotation of the church list, which grows with the number of churches and the size of their backlogs. With one church live today the rotation is one day. The Configurações panel shows each run, so a church whose purge is being cut short can see it in its own receipts.

**Mid-run timeout: what record the church gets.** The `pending` row stays, carrying counts that are true as far as the run got, and the cursor still advances. The next run opens a *new* record for whatever remains. A church therefore sees two lines for a purge that took two days, which is what actually happened. At the start of every run, retention rows still `pending` after **6 hours** are flipped to `done` with their counts as they stand. The sweep never invents a number and never attributes further deletion to the row; what it can do is freeze a count that already lags, up to and including 0/0/0, which is why the display rule below lists such a row instead of hiding it.

**Also swept each run:** `erasure_record` subject-request rows still `pending` more than **15 minutes** old. The sweep re-runs the delete for `subject_contact_id` (zero rows if it already succeeded) and marks the record `done` — **with no counts written**, because the counts have been on the row since it was opened. This is what makes the pending-first ordering safe: an interrupted erasure completes itself without anyone noticing it broke, and without a self-healed receipt claiming `0 mensagens, 0 pedidos de oração` for the one case where the delete definitely happened.

**Display rule for Configurações: every retention row is listed. No filter.** Revision 2 hid rows whose three counts were all zero and whose status was `done`, on the reasoning that a church should not be shown a line reporting that nothing happened. That reasoning inverts on the one case that matters. Trace it: probe finds work → `pending` row opened at 0/0/0 → a 500-row `DELETE` **commits** → the function is killed before the `+500` update → six hours later the sweep flips the row to `done` at 0/0/0. Five hundred message bodies are gone, the receipt says nothing was deleted, and the hidden-row filter means the church is shown **no line at all**. The failure the pending→done ordering was introduced to make impossible survived at a smaller size and was then made invisible.

So the filter is removed. An all-zero `done` row is exactly the row a church most needs to see, and it gets a suffix that says what it is:

> `{data} · Limpeza automática (12 meses) · a execução foi interrompida antes de registrar a contagem`

**Why this remedy and not the other.** The re-attack offered a choice: retract the "truthful at every instant" claim, or list the all-zero rows. The claim had to be retracted regardless — a spec may not assert something it knows to be false, and the paragraph above does that work. But retracting a sentence changes nothing a church can see. The display rule is the edit that closes the actual defect, because the defect is *invisibility*, not wording. Both are done; only one of them is the fix.

The cost is the case the old filter existed for: a probe/delete race can produce a genuine "found work, deleted nothing" row, and that church now sees one line saying so. That is a rare, truthful, self-explaining line, and it is a much smaller harm than a silent 500-row deletion. The three-count `> 0` filter is not a safe proxy for "nothing happened", and this is why.

### Prayer requests: warned, exportable, purged anyway

**Settled by the owner** (`.superpowers/sdd/owner-decisions-2026-08-07.md:41-56`). Prayer requests are purged on the same 12-month clock as messages and idle contacts — no exemption, no longer period. The church is warned first and offered an export, and **the purge happens whether or not the export is taken.** The owner's reasoning is the one the purge scope decision already rests on: prayer requests carry health, family and faith detail, so the argument for keeping them longest is the same argument for keeping them least. The export exists so a church that wants its pastoral history can keep it deliberately, not so that inertia keeps sensitive data alive forever.

**Lead time: 30 days. Why 30 and not 7 or 90.**

The only channel this product has to a church is the panel. There is no email address on file for a secretary, no in-product notification system, and this spec has already refused to add one — a WhatsApp or email message saying "we are about to delete your members' prayer requests" is alarming, needs a delivery channel that does not exist, and would be a second place member data could leak. A warning delivered by a passive channel has to survive the reader's absence, so the window is chosen against how often a secretary actually opens the panel:

- **7 days is defeated by one holiday.** A secretary who checks the panel weekly and takes two weeks off in December loses prayers without ever having seen the warning. A courtesy nobody can receive is not a courtesy.
- **90 days makes the warning permanent, which makes it invisible.** Prayer requests arrive continuously, so once a church passes its first year a 90-day window is almost never empty. A banner that is always on stops being read within a month — the failure mode is not that the church misses one warning, it is that the church stops seeing warnings at all.
- **30 days clears exactly one full monthly cycle** with room for a two-week absence, and it is short enough that the window is frequently empty for a normal-volume church, so the banner appearing still means something. It is also the coarsest unit a church actually plans in.

30 days is a starting point tied to an assumption — that a secretary opens the panel at least monthly — which nobody here has observed, because no church has used this product yet. It is listed under "What cannot be verified here".

**Where the warning appears.** Two read pages, both already guarded by `requireReadableSession`: the **Oração** page, because that is where a secretary who cares about prayer requests already is, and the **Configurações** "Retenção e exclusões" panel, beside the retention statement it qualifies. It is rendered only when the count is greater than one; there is no empty state, because a permanent "0 pedidos vão ser apagados" line is the 90-day failure in another form.

**The export covers prayer requests specifically.** `GET /api/dados/oracoes-expirando` streams, in the same `ReadableStream` + keyset shape as the member export, every prayer request whose `created_at` is earlier than `retentionCutoff(now) + 30 days` — that is, exactly the set the warning is counting, and exactly the set the next 30 days of purges will destroy. Not the church's whole prayer archive: a full archive is a whole-church backup, which this spec puts out of scope on its own risk grounds, and a warning-driven export should hand over the thing that is about to be lost and nothing else.

- Same headers as the member export: `application/json; charset=utf-8`, `Cache-Control: no-store`, `Content-Disposition: attachment; filename="pedidos-de-oracao-a-expirar-<yyyy-mm-dd>.json"`. No phone or name in the filename.
- Same declarations: `export const maxDuration = 60`, `export const dynamic = 'force-dynamic'`, same 45 s budget, same 50 000-row ceiling, same `aviso`/`continuacao` footer.
- Each entry carries `quando`, `situacao`, `texto`, and the member's `nome` and `whatsapp` — because a prayer request the church cannot attach to a person is pastorally worthless, and this file goes to the controller, not to a member. That makes it the single most sensitive artifact this subsystem produces, and the panel copy says so.
- Church-scoped by the same two predicates as everything else; served by `prayer_request_church_created_idx`.
- Guarded by `checkDataRightsSession` — the third and last member of the allowlist in "Why a suspended church may still delete". It grants no new reading power: the Oração page already shows a suspended church every prayer request it holds.
- Two new church-scoped functions on the existing `src/lib/repo/prayer-admin.ts` (which is already church-scoped and already joins `contact` on two predicates): `countExpiringPrayers(churchId, before)` and `pageExpiringPrayers(churchId, before, after, limit)`. No new module.

**The warning is a courtesy, not a consent gate — stated in the product, not only here.** Nothing about the purge is conditional on the export. The cron route does not check whether a warning was displayed, does not check whether a file was downloaded, and has no field it could check with: `erasure_record` records deletions, not notifications. A church that never opens the panel for a year loses its prayer requests on schedule, and the panel says that in so many words rather than leaving it to be discovered. The accepted cost is the owner's, recorded verbatim in the decisions file: *"a church that ignores the warning loses the data anyway. That is the correct default — the alternative is holding sensitive data indefinitely because nobody read an email."*

**At launch this warning never fires,** for the same reason the purge deletes nothing: no prayer request in the system is eleven months old, and none will be for eleven months.

### Scheduling

```json
{ "crons": [{ "path": "/api/cron/purge", "schedule": "0 6 * * *" }] }
```

`vercel.json` is a **new file**; none exists in the repository today. 06:00 UTC = 03:00 in Brasília. Vercel cron schedules are UTC and, on the Hobby plan, fire within the hour rather than at the minute — irrelevant for a job whose cutoff is measured in months.

**The handler is `GET`.** Vercel Cron issues a GET request to the path, carrying `Authorization: Bearer $CRON_SECRET`. The route exports `GET`, plus `export const dynamic = 'force-dynamic'` (a cacheable GET would run the purge once and then serve its own stale response every day thereafter) and `export const maxDuration = 60`. There is no `POST` export; a POST returns Next's default 405.

**Suspension is ignored.** A suspended church's data still ages, and retention is the controller's legal obligation, not a product feature to be withheld over billing. This does not contradict "never delete a church's data over billing" — nothing here is deleted *because of* billing.

**Is the church told?** Yes, passively. Configurações shows the last runs: *"07/08/2026 · Limpeza automática (12 meses) · 1.240 mensagens, 12 pedidos de oração, 3 cadastros apagados"*, above a standing sentence explaining that the cleanup runs daily. No email, no WhatsApp message: a monthly "we deleted your members' data" email to a church secretary is alarming, unactionable, and would itself need a delivery channel this product does not have.

**At launch this job deletes nothing.** No row in the system is a year old, and none will be for a year. The batching, the cursor and the slice caps are insurance for the day churches cross the boundary with a year of accumulated history.

---

## Export and portability

**Trigger:** the secretary, from the member page. Never the member directly, never the vendor.

**Delivery:** `GET /api/dados/<contactId>` responds with `Content-Type: application/json; charset=utf-8`, `Content-Disposition: attachment; filename="dados-membro-<first-6-of-uuid>-<yyyy-mm-dd>.json"`, and `Cache-Control: no-store`. The filename carries no phone and no name — it lands in a shared secretariat's Downloads folder. The URL carries only the contact UUID (already in `/admin/caixa/<contactId>` today) and, for a continuation file, a keyset cursor made of a timestamp and a row UUID. Neither is personal data; no phone, name or body text ever goes in a query string.

**The route declares `export const maxDuration = 60` and `export const dynamic = 'force-dynamic'`.** This is not decoration. No file under `src/` sets `maxDuration` today — verified by grep, the repository has never needed it — so the export route would inherit Vercel's default, which is 10 s on the Hobby plan. Revision 2 specified a 45 s wall-clock budget and a 50 000-row ceiling on a route that the platform would have killed at 10 s, meaning the entire bounding design would have been dead code on precisely the member whose history is large enough to need it. The 45 s budget is only meaningful under a 60 s ceiling; the two numbers belong to the same decision and must be written in the same file. Whether the plan in force actually permits `maxDuration = 60` is in "What cannot be verified here", alongside the same question for the cron route.

**Isolation:** the handler resolves `churchId` from the session and calls the church-scoped loaders, so another church's `contactId` returns 404 — the same two-predicate pattern `tests/repo-isolation.test.ts` already exercises for `loadConversation`.

### Bounded, and actually streamed

The original said the response was "built in memory and streamed", which is two different things, and specified `buildMemberExport(church, contact, messages, prayers, now)` — a function that takes fully materialised arrays. `loadMemberData` had no LIMIT, no cursor and no budget, while the purge next door got batching at 500. A member with a year of heavy history would have pulled every row over `neon-http` in one response and `JSON.stringify`d it inside a serverless function, failing on precisely the member with the most data — the one whose Art. 18 V deadline matters most.

**`neon-http` has no server-side cursors,** so "stream from the database" is not on the menu. What is:

- The response body is a `ReadableStream`. The route writes the header object, then pages, then the footer, as UTF-8 chunks. **At most one page — 1 000 rows — is in memory at a time.**
- Paging is **keyset**, ascending, on `(created_at, id)`: `WHERE church_id = $1 AND contact_id = $2 AND (created_at, id) > ($3, $4) ORDER BY created_at, id LIMIT 1000`. Stable under concurrent inserts, and covered by `message_contact_keyset_idx` / `prayer_request_contact_keyset_idx` from migration 0004, whose four columns are exactly these four.
- Two cheap `count(*)` statements run first so the header can carry `total_de_mensagens` / `total_de_pedidos` honestly.
- **Ceiling:** 50 000 rows per collection, or a 45 s wall-clock budget, whichever comes first. At 12 months' retention, 50 000 messages is 137 per day, every day, from one person.

**Behaviour past the ceiling is defined, not hoped for.** The stream closes as valid JSON, the footer carries an explicit pt-BR `aviso`, and the panel offers a continuation. **The continuation is a keyset cursor, not a date** — revision 2's `?desde=YYYY-MM-DD` is withdrawn:

```
GET /api/dados/<contactId>?apos=mensagens:2026-03-12T19:04:11.208Z,7c1e…-…-…
GET /api/dados/<contactId>?apos=oracoes:2026-03-12T19:04:11.208Z,7c1e…-…-…
```

- **Why a date could not work.** Truncation happens at a keyset position `(created_at, id)`, which is mid-day and mid-second. Resuming at `>= that date` re-exports everything earlier in that day; resuming at `> that date` skips the rest of it. There is no third option, so the test that revision 2 wrote — "a continuation that returns the remainder with no overlap and no gap" — was unsatisfiable against its own URL design. A defect the spec's own test could not pass is worse than a missing test.
- **Why the stated privacy reason did not apply.** The date was chosen so that "no personal data goes in a query string". That rule is right and stays, but neither `message.created_at` nor `message.id` is personal data: the id is a `defaultRandom()` UUID that identifies a row, not a person, and it is already the same class of value as the `contactId` sitting in the path today. The excluded values are the phone, the name, the body, and `wa_message_id` — and none of those is in the cursor.
- **One cursor is enough, because there is one truncation point.** The stream writes messages first, then prayers, so truncation is either mid-messages (prayers not started) or mid-prayers (messages complete). The `apos` value names which collection it resumes and where; a continuation that resumes mid-messages then runs the prayers to completion as usual. The cursor is emitted by the footer as `continuacao`, and the panel passes it straight back — the secretary never types or reads it.
- **The date stays in the human copy.** *"O arquivo ficou grande demais e foi até {data}"* is what a secretary should see; the opaque cursor is what the link carries. Human-readable and machine-resumable are different jobs and revision 2 tried to make one value do both.

The secretary hands over two files instead of one, and neither the church nor the member is told a truncated file is complete. Truncation is never silent.

**Shape** (keys pt-BR, because a member reads them):

```json
{
  "gerado_em": "2026-08-07T09:00:00.000Z",
  "igreja": "Igreja Exemplo",
  "titular": {
    "nome": "Maria",
    "whatsapp": "5511999998888",
    "primeiro_registro": "2026-01-04T18:22:00.000Z",
    "ultima_mensagem_recebida": "2026-08-01T13:40:00.000Z",
    "total_de_mensagens": 412,
    "total_de_pedidos_de_oracao": 3
  },
  "mensagens": [
    { "quando": "2026-01-04T18:22:00.000Z", "de": "membro", "texto": "Oi, qual o horário do culto?" },
    { "quando": "2026-01-04T18:22:03.000Z", "de": "igreja", "texto": "Escolha uma opção:" }
  ],
  "pedidos_de_oracao": [
    { "quando": "2026-03-02T20:10:00.000Z", "situacao": "orado", "texto": "…" }
  ],
  "compartilhamento": [
    "WhatsApp (Meta Platforms) — é por onde a conversa acontece.",
    "Serviços de hospedagem e banco de dados que executam o sistema da igreja.",
    "Não vendemos, alugamos nem cedemos estes dados a terceiros."
  ],
  "retencao": "As conversas e os pedidos de oração são apagados automaticamente após 12 meses.",
  "observacoes": [
    "Áudios, fotos e outros arquivos enviados não são guardados por nós — apenas o registro de que uma mídia chegou.",
    "Esta cópia contém apenas o que a igreja guarda. A conversa também existe no seu aparelho e nos servidores do WhatsApp, fora do controle da igreja."
  ]
}
```

When and only when the ceiling or the budget is reached, the footer gains two keys:

```json
  "aviso": "Este arquivo vai até 12/03/2026. Havia mais dados do que cabe em um único arquivo — a secretaria da igreja pode gerar o restante em um segundo arquivo.",
  "continuacao": "mensagens:2026-03-12T19:04:11.208Z,7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77"
```

**Who reads `continuacao`.** The route is the only party that knows where it stopped — the ceiling is predictable from a row count, the 45 s budget is not — so the resume point is written into the file rather than guessed by the panel. The panel then reads it back, and this costs nothing new: revision 2 already required the panel to render *"O arquivo ficou grande demais e foi até {data}"*, which it can only do by reading the response body. So the export button fetches the response, hands the bytes to the browser as a download (`URL.createObjectURL` — the secretary's own browser, not Vercel Blob), and takes `aviso` and `continuacao` from the same object. The secretary never sees, types or pastes the cursor; they see two buttons and hand over two files.

`wa_message_id` and internal UUIDs are excluded — they mean nothing to the member and one of them may encode their phone number.

**What makes this not a new leak:** nothing is written to Blob, to disk, or to a queue; the body exists only as a stream of chunks and then only in the secretary's browser. The panel copy tells them to hand it only to the person and delete it afterwards — the one control that lives outside the software, said out loud rather than assumed.

---

## Auditability (Art. 6 X, demonstrability)

The evidence chain is three things, none of which is a copy of the deleted data:

1. **`erasure_record`** — for each subject request: when, why, by which staff email, how many rows of each kind, and an HMAC of the number, with at most one row per contact enforced by a partial unique index. For each retention run that deleted something: when, and how many rows, incremented as the work commits. Enough to answer ANPD's "prove you did it" without reconstructing anything.
2. **The hash-verification box** in Configurações — the church types a number, the panel hashes it and looks it up. The proof works for the returning member, not just for the regulator.
3. **The test suite** — the existing cross-tenant isolation suites plus the new erasure/purge suites run on every commit. Art. 6 X asks the controller to demonstrate that controls work; a passing suite is that demonstration, and it is the argument the previous spec already staked out.

What the record deliberately cannot do: tell you what the member said, what they were called, or what number they used. If someone with database access wants to know who was erased, they need `ERASURE_HASH_SECRET` and a candidate number to test — a guessing game, not a list.

---

## The 🔒 Privacidade text

The current text (`src/lib/church-defaults.ts:31-45`) needs four changes and one removal:

1. **Sharing (Art. 18 VII) is missing entirely.** It must be there.
2. **Retention names only "as conversas"** — the purge also deletes prayer requests, and the promise should cover what the system does.
3. **The consequence of deletion** — that a new message starts a new history — is not stated, and members must not believe deletion is a permanent block.
4. **The opening line is a compliance claim in members' ears.** *"Seus dados são tratados de acordo com a LGPD (Lei nº 13.709/2018)"* was defended in the original draft as "a statement about practice… never that the app 'is compliant'". That distinction is real to a lawyer and invisible to a member of a church in the interior of Minas reading it on a phone: *tratados de acordo com a LGPD* reads as *this is compliant*. The binding constraint says the bot must never claim compliance, and re-adopting the line verbatim into v2 — while this same spec flags LGPD claims everywhere else — was inconsistent. It is replaced with a sentence that only describes what follows.
5. **`_Edite este texto no painel._` is addressed to the secretary but is read by members.** It goes; the same guidance moves to the Conteúdo page as panel copy.

**New `PRIVACY_ITEM.bodyText`, verbatim (951 characters — measured, and deliberately under the 1024 WhatsApp image-caption cap, so the text still sends if a church attaches an image to this item, `src/lib/whatsapp.ts:24-26`):**

```
*Privacidade e seus dados*

Abaixo está o que a igreja guarda sobre você, por quê, por quanto tempo e com quem isso é compartilhado.

*O que guardamos:* seu número de WhatsApp, seu nome no WhatsApp, as mensagens desta conversa e, se você enviar, seu pedido de oração.

*Por quê:* para responder às suas dúvidas e atender aos seus pedidos.

*Por quanto tempo:* as conversas e os pedidos de oração são apagados automaticamente após 12 meses.

*Com quem compartilhamos:* apenas com os serviços que fazem este atendimento funcionar — o WhatsApp (Meta) e as empresas que hospedam nosso sistema. Não vendemos nem cedemos seus dados.

*Seus direitos:* você pode pedir a qualquer momento uma cópia dos seus dados, a correção do seu nome ou a exclusão de tudo. Fale com a secretaria da igreja.

A conversa também fica no seu aparelho e nos servidores do WhatsApp, fora do nosso controle. E se você escrever de novo depois da exclusão, um novo histórico começa.
```

The statute is no longer named in the member-facing text at all. It does not need to be: the rights it grants are described in plain language, exercisable by a real button, which is more use to a member than a law's number. The word "dízimo" does not appear anywhere in this subsystem.

**Rollout.** `PRIVACY_ITEM` is a *seed*: each church holds its own editable `menu_item` row (`provisioning.ts` copies it in at creation; `seedPrivacyItem` repairs it), so changing the constant updates nobody. `src/lib/church-defaults.ts` therefore keeps the previous body frozen as `PRIVACY_ITEM_V1_BODY`, and the owner console gains **"Atualizar texto de Privacidade"**, which rewrites the row only when its current body is byte-identical to a known previous default. A church that edited its own text is never overwritten — the vendor may replace vendor-authored text, never the controller's own words. Churches whose text was edited are listed in the owner console so Rafael can call them. With one church live today this costs one click.

---

## Every user-facing string, verbatim

**Member data page — `/admin/caixa/[contactId]/dados`**

| Where | pt-BR |
|---|---|
| Title | `Dados desta pessoa` |
| Intro | `Tudo o que a igreja guarda sobre esta pessoa. Use esta página quando alguém pedir uma cópia dos seus dados, a correção do nome ou a exclusão de tudo (LGPD, art. 18).` |
| Not-in-the-system note | `Se o número da pessoa não aparece na Caixa de Entrada, a igreja não guarda nada sobre ela — pode responder isso.` |
| Summary | `Cadastro: nome e número de WhatsApp · Mensagens: {n} · Pedidos de oração: {n} · Primeiro registro: {data} · Última mensagem recebida: {data}` |
| Name field label | `Nome` |
| Save name button | `Salvar nome` |
| Name saved | `Nome atualizado.` |
| Name empty | `O nome não pode ficar em branco.` |
| Why bodies are not editable | `As mensagens e os pedidos de oração não podem ser editados: são o registro do que foi dito. Se a pessoa quiser que algo saia daqui, a saída é apagar os dados dela.` |
| Export button | `Baixar cópia dos dados (JSON)` |
| Export hint | `O arquivo é gerado na hora e não fica guardado no sistema. Ele contém dados pessoais: entregue apenas à própria pessoa e apague do computador depois.` |
| Export failed | `Não foi possível gerar o arquivo. Tente novamente.` |
| Export truncated (panel) | `O arquivo ficou grande demais e foi até {data}. Baixe o restante no botão abaixo e entregue os dois arquivos à pessoa.` |
| Export continuation button | `Baixar o restante (a partir de {data})` |
| Delete section title | `Apagar os dados desta pessoa` |
| Delete explanation | `Apaga o cadastro, todas as mensagens e todos os pedidos de oração desta pessoa. É definitivo e não pode ser desfeito.` |
| Prayer warning (when `prayersNovo > 0`) | `Atenção: {n} pedido(s) de oração ainda marcado(s) como "novo" também será(ão) apagado(s).` |
| In-flight warning (mode `human`, window open) | `Esta conversa está em atendimento e a janela de 24 horas ainda está aberta. Depois de apagar não será possível responder por aqui — se precisar avisar a pessoa, faça isso antes.` |
| Future-contact note | `Apagar não bloqueia o número. Se a pessoa escrever de novo, uma nova conversa começa do zero.` |
| Confirmation label | `Para confirmar, escreva APAGAR` |
| Delete button | `Apagar definitivamente` |
| Wrong confirmation | `Escreva APAGAR para confirmar.` |
| Success | `Dados apagados. Comprovante registrado em {data}.` |
| Already deleted | `Estes dados já haviam sido apagados.` |
| Contact not found / other church | `Conversa não encontrada.` |
| Record insert failed | `Não foi possível registrar o comprovante de exclusão. Nada foi apagado — tente novamente.` |
| Delete failed after record opened | `A exclusão foi iniciada mas não terminou. Ela ficou marcada como pendente e será concluída automaticamente; você também pode tentar de novo agora.` |
| Generic delete failure | `Não foi possível apagar os dados. Tente novamente.` |
| Pending banner | `Exclusão pendente desde {data}. Tente novamente para concluir.` |

**Export file — truncation notice** (JSON value, read by the member)

| Where | pt-BR |
|---|---|
| `aviso` | `Este arquivo vai até {data}. Havia mais dados do que cabe em um único arquivo — a secretaria da igreja pode gerar o restante em um segundo arquivo.` |

**Conversation page — new link**

| Where | pt-BR |
|---|---|
| Link | `Dados e privacidade` |

**Prayer list — new link per row** (requires adding `contactId` to `PrayerRequestWithContact`, `src/lib/repo/prayer-admin.ts:5-12`, which does not expose it today)

| Where | pt-BR |
|---|---|
| Link | `Ver dados desta pessoa` |

**Conteúdo page — Privacidade guidance (replaces the removed bot line)**

| Where | pt-BR |
|---|---|
| Hint | `O item 🔒 Privacidade é o aviso que os membros leem no WhatsApp. Você pode editá-lo, mas mantenha o que é guardado, por quê, por quanto tempo, com quem é compartilhado e como pedir cópia ou exclusão.` |

**Configurações — "Retenção e exclusões" panel**

| Where | pt-BR |
|---|---|
| Title | `Retenção e exclusões` |
| Standing text | `As conversas e os pedidos de oração são apagados automaticamente após 12 meses. A limpeza roda todos os dias de madrugada.` |
| Empty state | `Nenhuma exclusão registrada ainda.` |
| Retention row | `{data} · Limpeza automática (12 meses) · {n} mensagens, {n} pedidos de oração, {n} cadastros apagados` |
| Retention row, interrupted (status `done`, all three counts zero) | `{data} · Limpeza automática (12 meses) · a execução foi interrompida antes de registrar a contagem` |
| Subject-request row | `{data} · Pedido do titular · {n} mensagens, {n} pedidos de oração · por {email}` |
| Pending suffix | ` · pendente` |
| Verify box title | `Verificar uma exclusão` |
| Verify field label | `Número de WhatsApp` |
| Verify button | `Verificar` |
| Verify found | `Sim. Os dados deste número foram apagados em {data}.` |
| Verify not found | `Nenhuma exclusão registrada para este número.` |
| Verify unavailable | `A verificação não está disponível nesta instalação.` |
| Verify hint | `O número apagado não fica guardado. A verificação usa uma impressão digital (hash) do número.` |

**The 30-day prayer-request warning** — rendered identically on the Oração page and inside "Retenção e exclusões", **only when `{n}` is greater than zero**. This is the copy the owner decision asks for, verbatim.

| Where | pt-BR |
|---|---|
| Title | `Pedidos de oração que serão apagados em breve` |
| Body | `{n} pedido(s) de oração completam 12 meses nos próximos 30 dias e serão apagados automaticamente. Se a igreja quiser guardar esse histórico, baixe a cópia antes — depois de apagados não há como recuperar.` |
| Not-a-gate line (always shown with the warning) | `A limpeza acontece mesmo que ninguém baixe o arquivo. Este aviso é uma cortesia, não um pedido de autorização.` |
| Export button | `Baixar os pedidos que serão apagados (JSON)` |
| Export hint | `O arquivo traz o nome e o número de quem fez cada pedido, junto com o texto. É o arquivo mais sensível do sistema: guarde em lugar seguro e não compartilhe fora da equipe.` |
| Export failed | `Não foi possível gerar o arquivo. Tente novamente.` |
| Export truncated (panel) | `O arquivo ficou grande demais e foi até {data}. Baixe o restante no botão abaixo e guarde os dois arquivos.` |
| Export continuation button | `Baixar o restante (a partir de {data})` |

**Export route errors** (JSON body) — reuses `UNAUTHENTICATED_MESSAGE` and `REVOKED_MESSAGE` from `src/lib/auth/writable.ts:86-92`, plus:

| Where | pt-BR |
|---|---|
| Not found / other church | `Conversa não encontrada.` |

**Owner console**

| Where | pt-BR |
|---|---|
| Button | `Atualizar texto de Privacidade` |
| Updated | `Texto de Privacidade atualizado.` |
| Refused (church edited it) | `Esta igreja editou o próprio texto de Privacidade. Fale com ela antes de alterar.` |
| Already current | `Esta igreja já está com o texto mais recente.` |
| Failed | `Não foi possível atualizar o texto. Tente novamente.` |

The cron route returns no user-facing text; its responses and logs are operator-facing and stay in English, like the existing CLI scripts.

---

## Failure modes

| Failure | What happens | Why it is acceptable |
|---|---|---|
| Secretary double-clicks `Apagar definitivamente` | Run A inserts the receipt and deletes. Run B's conditional INSERT matches no contact row (already deleted) **or** hits the partial unique index — either way zero rows inserted. Run B looks up the existing record, finds it `done`, and returns "Estes dados já haviam sido apagados." | The guard is a database constraint inside a single statement, not an application pre-check. There is no window in which two receipts can exist for one contact. |
| Two secretaries delete the same member simultaneously | Whichever INSERT commits first wins; the other conflicts on `erasure_record_subject_uq` and takes the "já haviam sido apagados" path. | Same mechanism. Postgres, not luck. |
| `openSubjectErasure` throws | Nothing is deleted. Secretary sees "Nada foi apagado — tente novamente." | Both writes hit the same database; if the record cannot be written, the delete would not have committed either. No state to reconcile. |
| `deleteMember` throws after the record opened | A `pending` record exists, the data is intact. The page shows the pending banner; retrying re-enters the pending branch and completes; the daily sweep completes it otherwise. | Delete is idempotent, so the retry is always safe. The pending row is a visible alarm rather than a silent inconsistency. |
| `deleteMember` returns 0 after this call won the INSERT | The record is completed anyway. | Its assertion — this contact's data is not in the database — is true. A pending alarm about an already-correct state is noise. |
| `completeErasureRecord` throws after a successful delete | Data is gone; record stays `pending` with its counts intact. The sweep deletes zero rows and flips it to `done`. | The dangerous direction — a `done` record over surviving data — is impossible by ordering. The self-healed receipt keeps its real counts because they were written at open time, not at completion. |
| Member writes at the same moment as an erasure | A fresh contact row with a new UUID appears seconds later; the record's counts describe the state observed immediately before the delete. | The record is proof of an act, not an inventory. Off-by-one under a genuine race is honest; the alternative (counting deleted rows exactly) would require deleting each table separately and reintroduce the half-deleted member. |
| Member writes mid-purge, between the child deletes and the contact delete | The contact fails the `NOT EXISTS` guard and survives to the next run. Nothing is cascaded, no count drifts. | The count model is preserved by construction rather than by a narrower race window. |
| Retention record insert fails before any delete | Nothing is purged for that church this run; the cursor still advances; the next run retries. | Evidence before deletion, symmetric with erasure. A day of retention overrun beats a year of deleted bodies with no proof. |
| Purge run is hard-killed between a committed batch `DELETE` and its `+n` count `UPDATE` | Rows are gone; the receipt lags by up to 500 per table, possibly reading 0/0/0. The 6-hour sweep flips it to `done` with the counts as they stand, and Configurações **lists it anyway**, with `a execução foi interrompida antes de registrar a contagem`. | The invariant is one-directional: a receipt never overstates. The church sees a line saying a cleanup ran and its count is unreliable, which is true and actionable. Revision 2 hid this row, so 500 destroyed message bodies produced no visible line at all — that is the defect this row exists to record as closed. |
| Retention receipt reports fewer rows than were deleted | Accepted, bounded at one batch per table per interruption. | Stated as a floor, never a ceiling. The alternative — folding the `DELETE` and the `UPDATE` into one CTE — is new machinery that moves the boundary rather than removing it, and this spec's whole reason for existing is that the previous pass added machinery and added defects with it. |
| Prayer-request warning shown, export never taken | The prayers are purged on schedule anyway. | **Owner decision, deliberate.** The warning is a courtesy, not a consent gate. The panel says this in the warning itself, so the church is not surprised by its own default. |
| Church never opens the panel during the 30-day window | Same: purged on schedule, no warning ever seen. | The honest residual of a passive-only channel. The alternative is an email or WhatsApp notification, which needs a delivery channel this product does not have and would put member data in a second place. 30 days is the mitigation, not a guarantee. |
| Purge run times out mid-batch | Partially purged. The `pending` receipt carries counts that are true so far; the cursor advances; the next run opens a new receipt for the remainder; the 6-hour sweep flips the stale row to `done`. | Every deleted row is a completed unit and is on a receipt. The church sees two lines for a two-day purge, which is what happened. |
| One church's backlog is enormous | Its slice caps at 10 s / 20 batches per table; the cursor advances; other churches are purged in the same run. | Without the cap, one church starves the platform — the exact failure the flat "45 s and stop" budget produced. |
| Cron does not fire for days | Retention overruns by those days; the next runs work through the rotation. | A bounded, self-healing overrun, visible in Vercel's cron log and in each church's own receipts. **Accepted risk:** there is no in-product alarm for a dead cron. |
| Cron route exported as `POST` only | 405 on every scheduled run; nothing is ever purged; nothing says so. | **Prevented, not accepted:** the method is specified as `GET`, and the cron-auth tests call the exported `GET`. |
| `CRON_SECRET` unset | Endpoint refuses (503) and logs loudly; no purge runs. | Deliberate inversion of fail-open. An unauthenticated purge endpoint is a public delete button. |
| Someone hits `/api/cron/purge` without the token | 401, nothing runs. Constant-time comparison, as in `verifySignature` (`src/lib/whatsapp.ts:84-98`). | Same discipline the WhatsApp webhook already uses. |
| `ERASURE_HASH_SECRET` unset or rotated | Erasure proceeds; hash stored as `null`, or old records stop matching. Verify box answers `A verificação não está disponível nesta instalação.` | Never block a statutory erasure on an operator env var. Counts and timestamps remain valid evidence. |
| Export exceeds 50 000 rows or the 45 s budget | Valid JSON closes with the `aviso` **and the `continuacao` cursor**; the panel reads both from the response and renders the truncation notice plus a continuation link carrying that cursor. | Defined, visible, and continuable. The continuation resumes at the exact `(created_at, id)` where the previous file stopped, so there is no overlap and no gap — which revision 2's date-granular `?desde=` could not deliver in either direction. |
| Export route is killed by the platform before the 45 s budget applies | **Prevented, not accepted:** the route declares `maxDuration = 60`. Without it Vercel's 10 s default applies and no bounding logic ever runs. | Verified that no file in `src/` sets `maxDuration` today, so this had to be stated rather than assumed inherited. Whether the plan in force honours 60 s is unverifiable here and listed as such. |
| Export requested for another church's contactId | 404 with `Conversa não encontrada.` | Church-scoped loaders; the isolation pattern the repo suite already verifies. |
| Export requested while the church is suspended | Succeeds. | Deliberate — grants no new reading power, since `requireReadableSession` already permits reading every message (`writable.ts:75-84`). |
| **Delete performed while the church is suspended** | Succeeds. | Deliberate and argued separately — see "Why a suspended church may still delete". Revocation is still checked, the scope is one member, and the alternative is the operator holding the controller's statutory obligation hostage to an invoice. |
| Privacidade text lengthened past 1024 by a church that also attaches an image | Graph API 400 on that item; the member gets the error text instead of the notice. | Pre-existing behaviour of image captions, newly reachable because v2 is longer. Mitigated by keeping v2 at 951 characters; a length warning on the item form is a follow-up, not part of this spec. |
| A church deletes its own Privacidade item | Members lose the notice. `PrivacyItemWarning` only fires at zero menu items (`src/app/owner/(protected)/[churchId]/page.tsx:35`), so this is invisible. | **Named gap.** The right fix is an owner-console check for "has an item whose body mentions privacidade" — out of scope here, worth a backlog entry. |

---

## Testing

All on PGlite with real migrations, plus pure unit tests — the existing pattern.

- **`retention.ts`** — cutoff boundary: a row exactly 365 days old, one second younger, one second older, and a null `last_inbound_at` falling back to `created_at`.
- **Cascade atomicity** — insert a contact with messages and prayers, run the single `DELETE`, assert all three tables are empty for that contact and that the other church is byte-identical. This extends the cascade assertion `tests/tenant-isolation.test.ts:166-175` already makes at the church level.
- **Double-click erasure (C1)** — call `deleteMemberData` twice; assert exactly **one** `erasure_record` row exists, it is `done`, and the second call returns `alreadyDeleted`. Then a direct second `openSubjectErasure` against the live database asserting the partial unique index rejects it, so the guard is proven at the schema level and not only at the action level.
- **Erasure never mints a receipt for a phantom contact** — call `openSubjectErasure` with a contactId that does not exist, and with one belonging to another church; assert zero rows inserted in both cases.
- **Erasure ordering** — force the delete to throw, assert the record is `pending`, its counts are the pre-delete counts, and the data is intact; then run the sweep and assert `done`, counts unchanged, data gone. **Explicitly assert the swept record's counts are not zero** — the regression I3 named.
- **Idempotence** — delete twice; second call reports "já apagados" and writes no second record.
- **Purge counting (C4)** — one church with 3 idle contacts holding 900 messages plus 340 old messages of still-active members; assert the receipt reads exactly 1 240 messages and 3 contacts, i.e. that no row was removed by an invisible cascade. This test fails against the original ordering, which is the point of writing it.
- **Purge cascade cannot fire** — insert a message for an idle contact, run only the contact-delete statement, assert zero rows deleted (the `NOT EXISTS` guard holds).
- **Purge receipt ordering (C3)** — make the deletes succeed and the *completion* update fail; assert a `pending` retention row survives with truthful counts; run the sweep and assert `done`. Then make the *opening* insert fail and assert nothing was deleted.
- **Purge isolation and convergence** — two churches, mixed ages, assert only rows past the cutoff disappear and the other church is untouched; run twice and assert the second run deletes nothing; run with a batch limit of 1 and assert convergence.
- **Cross-church fairness (C2)** — five churches all needing work, a budget that admits only two per run; assert three runs cover all five and that no church is visited twice before every church has been visited once. Assert `retention_purged_at` advances even for a church whose slice was cut short.
- **Retention receipt under-reporting (N1)** — run a purge, let one batch `DELETE` commit, then force the `+n` `UPDATE` to throw; assert the rows are gone and the receipt still reads 0. Run the sweep, assert `done` at 0/0/0. Then assert the Configurações list **contains** that row and renders the interrupted string — the assertion revision 2's display rule would have failed.
- **Prayer-request warning and its export** — with prayers aged 11, 11.5 and 6 months, assert `countExpiringPrayers` returns 2 and that a church with none renders no warning at all. Assert the export contains exactly those two, carries `nome` and `whatsapp`, and is church-scoped against a second church. Assert the purge deletes them on schedule **with the export never having been called** — the "courtesy, not a gate" property, tested rather than asserted.
- **Export purity and bounding** — the three builders are pure: assert `wa_message_id` and internal UUIDs are absent, direction maps to `membro`/`igreja`, and null bodies survive as `null`. Then a paging test: 2 500 messages with a page size of 1 000 produce three pages, one valid JSON document, and every message exactly once.
- **Export continuation is exact (N3)** — 2 500 messages, ceiling forced to 1 000. Assert the first file carries `aviso` and `continuacao`; feed `continuacao` back as `?apos=`; assert the union of the two files is all 2 500 messages, each **exactly once**. The same test with several messages sharing one `created_at` to the millisecond, which is the case a date cursor cannot split and the `(created_at, id)` cursor can.
- **Export route declarations (N4)** — assert both export routes export `maxDuration` with the value 60 and `dynamic` as `'force-dynamic'`. A static read of the module, in the same style as the cron route's "exports `GET`, does not export `POST`" assertion. Cheap, and it is the only thing standing between the bounding design and a 10 s platform timeout.
- **Data-rights guard allowlist (N8)** — the claim in "Why a suspended church may still delete" point 5, made enforceable. Reusing `walk()` and `importedModules()` from `tests/privilege-boundary.test.ts`: collect every scanned file that references `requireDataRightsSession` or `checkDataRightsSession`, and assert the set is exactly `{ caixa/[contactId]/dados/actions.ts, api/dados/[contactId]/route.ts, api/dados/oracoes-expirando/route.ts }`. A fourth caller fails the test, which is the point — the exemption must not spread by copy-paste.
- **Cron auth and method** — missing header, wrong token, right token, unset `CRON_SECRET`; and that the module exports `GET` and does not export `POST`.
- **Isolation** — every new church-scoped repo function added to `tests/repo-isolation.test.ts`'s two-church attack list.
- **Privilege boundary (I4)** — the amended importer-keyed check: `retention.ts` importable only by the cron route; the webhook and the admin panel cannot reach it; `platform.ts` importable by nothing; and — the property the old shape could not express — `retention.ts` itself is scanned, proven by asserting `walk()`'s output contains it.
- **`RESTRICTED` keys actually match (N6)** — assert `RESTRICTED.has(importedModules(cronRoute).find(m => m.endsWith('repo/retention')))`, i.e. that a key from the map is a value the resolver really produces. Without this, a `.ts`-suffixed key makes the whole boundary check pass while matching nothing, and every other boundary test still goes green.
- **Redaction** — `redactError` on a real `Error` whose message is `Graph API 400: {"error":{"message":"…5511999998888…"}}`, asserting the digits are gone and the stack text survives.

---

## Out of scope

- Appointing a DPO/encarregado, a consent-management platform, ANPD breach-notification workflow.
- Multi-language versions of any text. Everything user-facing here is pt-BR.
- A member-initiated `APAGAR` command in the bot. Settled by the owner: the church acts.
- A whole-church export or backup from the owner console. Different purpose (migration/backup), different risk profile.
- Per-message or per-prayer deletion.
- A blocklist, a suppression list, or any "do not contact" register.
- Reaching Meta's copy of the conversation, the member's own handset, or Neon's backup retention window.
- Postgres RLS — still deferred, still blocked on the `neon-http` driver.
- Deleting a church's data on cancellation, and staff (`admin_user`) data-subject requests. Staff removal already hard-deletes the row (`src/lib/repo/admin.ts:33-35`); the audit email snapshot deliberately survives it.
- An in-product alarm for a dead cron.
- A length warning on the menu-item body form (the 1024-character caption cap).

## What cannot be verified here

Nothing in this repository has ever run against Neon, Meta, Vercel, or a browser. Specifically unverifiable until it does:

- **That the cascade deletes at production scale in one statement within Neon's limits.** The behaviour is proven on PGlite; a contact with tens of thousands of messages on a real Neon connection is not.
- **Vercel cron behaviour** — that the platform actually invokes the path with a **GET**, sends `Authorization: Bearer $CRON_SECRET`, and that `maxDuration` on the current plan permits the 45-second budget. Hobby-plan crons also fire within the hour rather than on the minute. The method is stated as GET on the strength of Vercel's documentation, not on an observed request.
- **That `maxDuration = 60` is honoured on the plan in force**, for the cron route and both export routes. What *is* verified is the negative: no file under `src/` declares `maxDuration` today, so the platform default applies unless this spec's routes declare it. The declaration is necessary; that 60 is granted is not established here.
- **The query plans for the purge statements.** Every index in migration 0004 is written to match a predicate that appears verbatim in this spec, and that correspondence is checkable by reading. Whether the planner picks them — especially whether the `created_at < $cutoff OR contact_id IN (…)` disjunction becomes a `BitmapOr` of two index scans rather than a sequential scan — cannot be observed without a database. PGlite will answer a *correctness* question here, not a performance one. Revision 2 asserted the performance claim; this revision does not.
- **That a church secretary opens the panel at least monthly**, which is the entire load-bearing assumption behind the 30-day prayer-request warning window. No church has used this product yet. If real usage is quarterly, 30 days is the wrong number and the window — not the purge — is what changes.
- **The real per-round-trip latency of `neon-http`**, which is what decides whether 500-row batches and 1 000-row export pages are the right sizes and whether the 45 s budget covers a useful number of churches. All three numbers are starting points to be measured, not tuned constants.
- **Whether Meta's Graph API error bodies actually contain a member's phone number.** The redaction fix is defence-in-depth against a plausible vector, not a fix for an observed leak, and this is the one item in this spec whose priority could drop to zero once a live Meta app exists.
- **Vercel log retention** — how long anything leaked into the runtime logs survives, and therefore how urgent redaction is. Plan-dependent and not observable from here.
- **Neon point-in-time restore window** — a deleted row remains recoverable inside it. The Privacidade text does not claim instant, universal erasure, but the exact window is a fact only the live account has.
- **That `wamid` values encode the member's phone number.** Treated as if they do. Confirming it needs a live Meta app.
- **Whether `drizzle-kit generate` emits the partial index predicate.** The migration is read before it is committed; the PGlite suite catches a dropped `WHERE`.
- **Stripe is not involved in this subsystem.** The only personal data at Stripe is the church's billing contact — staff, not members. Any claim about what Stripe holds or how it is deleted is unverifiable without a live account and belongs to the billing plan.
- **Whether 12 months is the right number.** It is a product decision reflected in an existing promise, not a legal determination.

## What the owner must decide before implementation

Two items that stood here in revision 2 have been **settled by the owner** (`.superpowers/sdd/owner-decisions-2026-08-07.md`) and are folded into the design above rather than listed here: prayer requests are purged on the 12-month clock with a 30-day warning and an export offered first, and a suspended church keeps a working delete button. Neither is open.

1. **How long do `erasure_record` rows live?** This spec keeps them for as long as the church exists. A five-year cap is arguable; destroying your own proof is worse than keeping a hash. (Also listed as open in the owner-decisions file.)
2. **Is a staff email in a permanent audit log acceptable?** The alternative loses "who did it" the day that person leaves. (Also listed as open in the owner-decisions file.)
3. **Who holds `ERASURE_HASH_SECRET` and `CRON_SECRET`,** and what happens on rotation.
4. **The privilege-boundary amendment** — the first named exception to an absolute rule, now shaped as an importer-keyed table that also closes the pre-existing "ALLOWED files are never scanned" gap for `platform.ts`. It should be approved deliberately rather than noticed in review.
5. **The 30-day warning window is a product choice, not a legal one.** The spec picks and justifies 30 days against a passive-only channel; the owner decision required the spec to choose, and it has. It is listed here only because the assumption it rests on — monthly panel visits — is unobserved, and the first real church can falsify it cheaply. Changing the window changes no mechanism.

---

## Revisions

**2026-08-07 — revision 3**, after the re-attack (`.superpowers/sdd/reattack-lgpd.md`, verdict "Needs revision — narrowly"). Revision 2 closed every Critical structurally and introduced four new defects doing it. All four are closed here by local edits; nothing was re-architected, and no mechanism was added that a finding did not force.

**Blockers.**

- **N1 (retention receipt under-reports, and the display rule hides it)** → **both remedies, and the spec says which one is the fix.** The "truthful at every instant" claim is retracted as false — with no transactions, a batch `DELETE` can commit and the function die before the `+n` `UPDATE` — and replaced with the invariant the design actually enforces: *a retention receipt never overstates; it can lag by at most one batch per table.* Separately, and this is the edit that closes the defect, the Configurações filter is removed: **every** retention row is listed, and an all-zero `done` row renders `a execução foi interrompida antes de registrar a contagem`. Retracting a sentence changes nothing a church can see; the display rule is what turns 500 silently destroyed message bodies into a visible line. The CTE alternative (`WITH d AS (DELETE … RETURNING id) UPDATE …`) was considered and rejected: it is new machinery and it moves the boundary rather than removing it.
- **N2 (indexes do not serve their predicates)** → both halves fixed at the source. `m.church_id = $1` / `p.church_id = $1` added to the two `NOT EXISTS` guards, so the leading column of the index is constrained and the index can be seeked. `contact_church_last_inbound_idx` is replaced by the expression index `contact_church_idle_idx ON contact (church_id, (coalesce(last_inbound_at, created_at)))`, which is what the idle predicate is actually written against. `message_contact_idx` and `prayer_request_contact_idx` are widened to `(church_id, contact_id, created_at, id)` so one index serves both the guard and the export keyset (this also closes **N5**). The performance claim itself is downgraded: the spec now asserts only that no predicate is unservable, and puts query plans in the unverifiable list, because there is no database here on which to read one.
- **N3 (`?desde=` cannot deliver the continuation)** → withdrawn and replaced by `?apos=<colecao>:<iso>,<uuid>`, a real keyset cursor. The re-attack is right on both counts: a date cannot name a position inside a day, so revision 2's own test was unsatisfiable, and the privacy justification did not apply — neither `created_at` nor a `defaultRandom()` row id is personal data, and the path already carries a contact UUID. The route emits the cursor as `continuacao` in the footer because only the route knows where a *budget* truncation stopped; the panel reads it from the response, which it already had to parse to render the truncation date.
- **N4 (export route never declares `maxDuration`)** → `export const maxDuration = 60` and `export const dynamic = 'force-dynamic'` are specified on both export routes, with a test asserting they are exported. Verified by grep that **no file under `src/` sets `maxDuration` today**, so nothing was going to be inherited. Whether 60 s is granted on the plan in force is unverifiable here and is listed as such rather than assumed.

**Minors.**

- **N5** → folded into N2: the keyset indexes are `(church_id, contact_id, created_at, id)`.
- **N6** → confirmed against the real file. `resolveSpecifier` strips extensions (`privilege-boundary.test.ts:58`), which is exactly why the existing assertion at `:77` compares against `PLATFORM_MODULE.replace(/\.tsx?$/, '')`. `RESTRICTED` keys are now `base(...)`-normalised, the asymmetry between keys (extensionless, from `importedModules`) and values (extension-bearing, from `walk`) is documented in the map's own comment, and a test asserts a key really matches something the resolver produces — without which the amendment passes green while enforcing nothing.
- **N7** → "skip to step 6's lookup" corrected to step 7.
- **N8** → the unbacked "a test says so" is made true rather than deleted: a **Data-rights guard allowlist** test is added to the Testing section, reusing the `walk()` + `importedModules()` scanner that `tests/privilege-boundary.test.ts` already runs. The count also changes from two to **three**, because the prayer-request export is a third caller; a fourth fails the test.

**Owner decisions folded in** (`.superpowers/sdd/owner-decisions-2026-08-07.md`), both removed from "What the owner must decide":

- **Prayer requests are purged on the same 12-month clock, with a warning and an export first.** New section "Prayer requests: warned, exportable, purged anyway": a **30-day** lead time, justified against the only channel this product has (the panel — 7 days dies to one holiday, 90 days makes the banner permanent and therefore invisible, 30 clears one monthly cycle); a dedicated `GET /api/dados/oracoes-expirando` covering **exactly the expiring prayer requests**, with `nome` and `whatsapp` attached because an unattributed prayer request is pastorally worthless; verbatim pt-BR warning copy including the not-a-gate line *"A limpeza acontece mesmo que ninguém baixe o arquivo. Este aviso é uma cortesia, não um pedido de autorização."*; two failure-mode rows and a test asserting the purge runs with the export never called. The 30-day window's load-bearing assumption — monthly panel visits — is unobserved and is listed as unverifiable.
- **A suspended church keeps a working delete button.** "Why a suspended church may still delete" is retitled **settled** and records the decision at the top; the reasoning stays so a later refactor does not route the path back through `requireWritableSession` without knowing why it was not there.

**Nothing was refuted this pass.** All eight findings held against the real source: the resolver really strips extensions, `src/` really has no `maxDuration`, `prayer_request` really declares no index callback at all, and the two `NOT EXISTS` guards really omitted `church_id`. One claim was *narrowed* rather than refuted — the indexes are correct-by-construction against the written predicates, but "not sequential scans" is a plan-level assertion this repository cannot make, so it moved to the unverifiable list instead of being reworded into something softer that would still have been unbacked.

---

**2026-08-07 — revision 1**, after adversarial review (`.superpowers/sdd/review-lgpd-spec.md`). Every finding the review listed as required is addressed below. One item is refuted with evidence.

**Refuted.**

- **The `contact.ts:49` phone-number leak no longer exists.** The review listed it under "Verified accurate", and the original spec scheduled a fix for it. Both are out of date: `src/lib/repo/contact.ts` on `main` throws `` `Contact race condition: could not find contact after conflicted insert for churchId=${churchId}` `` (`contact.ts:55`), with a comment at `:49-54` stating that the number is deliberately absent because the error lands in the hosting provider's logs. The fix bullet is withdrawn.
- **The related "Postgres unique-violation embeds the key values" claim was the original spec's own, and is overstated.** No code path can raise a `contact_church_phone_uq` violation: the only insert into `contact` carries `.onConflictDoNothing({ target: [contact.churchId, contact.phone] })` (`contact.ts:33`), and the only insert that could hit `message_wa_message_id_uq` does the same (`repo/message.ts:22`). The redaction work survives at reduced ambition, re-justified against Graph API error bodies (`whatsapp.ts:120-123`), and is explicitly labelled plausible-not-verified.

**Critical findings.**

- **C1 (double-click mints a phantom receipt)** → the receipt is now opened by a single `INSERT … SELECT FROM contact WHERE id = $1 AND church_id = $2 … ON CONFLICT DO NOTHING`, backed by the new partial unique index `erasure_record_subject_uq`. Two guards, one statement, no TOCTOU. The action's return type is now written out as a four-shape union, including what happens when `deleteMember` reports 0.
- **C2 (purge not resumable across churches)** → new `church.retention_purged_at` cursor, least-recently-purged ordering, a per-church slice cap so one church cannot eat the run, and the cursor advanced even for an unfinished slice. The "one-day overrun" claim is retracted in the text and replaced with "one full rotation of the church list".
- **C3 (retention rows had no pending→done ordering)** → retention receipts are now opened `pending` before any delete, with counts committed incrementally after each batch, and flipped to `done` at the end or by a 6-hour sweep. The asymmetry is not justified; it is removed. A `hasPurgeWork` probe keeps "a row means something was deleted" true without deleting before writing evidence.
- **C4 (counts wrong by construction)** → the statement order is inverted: children first (including children of contacts about to go), then contacts under a `NOT EXISTS` guard so a cascade can never fire. Every deleted row is returned by the statement that deleted it. The church-facing string is therefore kept verbatim because it is now true, rather than being softened to conceal an understatement. Migration 0004 gains the five indexes these predicates need.

**Important findings.**

- **I1** → the cron handler is specified as `GET`, with `dynamic = 'force-dynamic'` and `maxDuration = 60`, plus a failure-table row and a test asserting `POST` is not exported.
- **I2** → the export is keyset-paged at 1 000 rows into a `ReadableStream` (one page in memory), with a 50 000-row ceiling and a 45 s budget; past either, valid JSON closes with a pt-BR `aviso` and the panel offers a `?desde=` continuation file. `buildMemberExport` is replaced by three pure builders. The "built in memory and streamed" contradiction is gone.
- **I3** → `completeErasureRecord(recordId, churchId)` is a status flip only; counts are written at open time. The sweep can therefore complete an erasure without inventing numbers, and a test asserts the self-healed receipt is not `0/0`.
- **I4** → the boundary amendment is now an importer-keyed `RESTRICTED` map, and `walk()`'s `!ALLOWED.has(full)` filter is removed entirely, so restricted modules are still scanned for their own imports. `platform.ts` moves into the same map with an empty importer set, closing a pre-existing gap the project's own constraints call out.
- **I5** → "Why a suspended church may still delete" argues the destructive path on its own terms in five points, names the honest residual, and adds a separate failure-table row. The export argument is left where it belongs, on export.
- **I6** → the LGPD opening line is replaced with `Abaixo está o que a igreja guarda sobre você, por quê, por quanto tempo e com quem isso é compartilhado.` The statute is no longer named in member-facing text at all. New measured length: 951 characters, still under the 1024 caption cap.

**Minor findings.**

- **M1** → the "nothing existing is modified" claim is withdrawn. The exact edits to `schema.ts:1-3` (`index` added) and the new `import { sql } from 'drizzle-orm'` are written out, along with the `church` column.
- **M2** → `redactError(error: unknown): string` is added beside `redactPhones`, stringifying name + message + stack before redacting; the trade-off (Vercel loses the structured `Error`) and the deliberate exclusion of `webhook/route.ts:62` are stated.
- **M3** → the split is narrowed. `verifyIdentity` is the admin re-check only; `getChurchById` stays in the writable path. No read page gains a query or a redirect. The near-redundancy of the church-existence check is explained via `admin_user.church_id`'s `ON DELETE CASCADE`.
- **M4** → correction durability is stated in the Art. 18 table with the evidence: `findOrCreateContact` returns the existing row untouched (`contact.ts:20-28`) and no code path writes `contact.name` or `contact.phone` after creation.

**Also corrected while re-reading the source:** several line citations that had drifted (`writable.ts:86-92`, `admin.ts:33-35`, `tenant-isolation.test.ts:166-175`, `whatsapp.ts:84-98`, `blob/upload/route.ts:55-56`, `church-status.ts:13-21`), and a new "What cannot be verified here" entry for `neon-http` round-trip latency, which is what actually decides whether the batch, page and budget constants are right.
