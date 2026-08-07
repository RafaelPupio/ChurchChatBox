# Secretária Virtual — LGPD Art. 18 Data-Subject Tooling

**Design doc** · 2026-08-07 · Status: proposed

## Overview

A member writes to a church's WhatsApp number and asks: *"o que vocês guardam sobre mim?"*, *"me manda uma cópia"*, *"apaga tudo"*. Today the church can answer the first question by scrolling the Caixa de Entrada, and cannot answer the other two at all — there is no export, no delete, and nothing that ever removes old data. The 🔒 Privacidade item already promises members that *"as conversas são apagadas após 12 meses"* (`src/lib/church-defaults.ts:40`), and nothing in the codebase makes that true.

This subsystem builds the tooling that turns those promises into mechanisms, and it does it under two constraints already settled by the owner:

- **The church secretary performs deletions from the panel.** A member asks the church; staff act. There is no member-initiated delete command in the bot, and the vendor never deletes on a church's behalf.
- **Member data is auto-purged at 12 months.** The purge makes an existing promise true rather than adding a new one.

**Done means:**

1. A panel page per member that shows exactly what the church holds about that person, downloads it as one file, corrects the name, and deletes everything — reachable in two clicks from the conversation.
2. A daily job that deletes messages, prayer requests, and idle contacts older than 12 months, for every church, resumably.
3. A record that proves each deletion happened, which is not itself a copy of what was deleted.
4. A 🔒 Privacidade text that describes what the system actually does, including sharing (Art. 18 VII), which the current text omits entirely.
5. No path anywhere that writes member data to Vercel Blob, to a log line, or to a file that outlives the request.

**Roles.** The church is the *controlador*; Rafael is the *operador* (Art. 5 VI/VII). Every decision below follows from that: the tooling gives the controller the buttons, and the operator builds the machine that never acts on member data on its own initiative — except the retention purge, which is a documented, church-visible instruction rather than a discretionary act.

**Not legal advice.** These are engineering mechanisms informed by the statute. The retention period, the audit-record lifetime, and the legal basis each church relies on need a Brazilian lawyer.

---

## Where the personal data actually is

Verified against `src/db/schema.ts`, not assumed.

| Location | Personal data | Sensitivity |
|---|---|---|
| `contact` (`schema.ts:62-77`) | `phone` (the identifier — it *is* the person), `name` (whatever WhatsApp reports as their profile name) | The mere existence of a row associates a natural person with a church → **religious conviction, Art. 5 II sensitive** |
| `message` (`schema.ts:79-91`) | `body` — free text of everything said in both directions; `wa_message_id` | Ordinary personal data, unbounded content. Media is **not** stored: the webhook writes `null` for anything that is not text or a list reply (`webhook/route.ts:88-94`) |
| `prayer_request` (`schema.ts:93-100`) | `text` — free text, written in the most confessional state the product ever puts a member in | **The most sensitive row in the database.** Routinely carries health, family, financial and religious detail — three of Art. 5 II's categories in one column |
| `admin_user` (`schema.ts:103-112`) | Church staff `email`, `name`, `password_hash` | Staff, not members. Different data subject, different flow (see Out of scope) |
| Vercel runtime logs | **A member's phone number, in cleartext.** `src/lib/repo/contact.ts:49` throws `` `Contact race condition: … phone=${phone}` `` and the webhook's catch logs the error (`webhook/route.ts:180`). Separately, a Postgres unique-violation message embeds the conflicting key *values*, so a `contact_church_phone_uq` conflict surfaces the phone in the same log line | Sensitive, in a store neither export nor delete can reach |
| Meta / WhatsApp | The whole conversation, on Meta's servers and on the member's own handset | Outside our control entirely |
| Neon | The database at rest, plus whatever point-in-time restore window the plan provides | Deletion is not instant on backups |
| Vercel Blob | **Nothing.** Only admins upload, only menu images, and the URL is persisted on `menu_item.image_url` (`src/app/api/blob/upload/route.ts:50-56`). This must stay true — see the export decision | — |

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
| **V — portabilidade** | One JSON file, generated on request, downloaded by the secretary, never stored | New route |
| **VI — eliminação** | The delete flow, one atomic cascading statement + an audit record | New action |
| **VII — informação sobre uso compartilhado** | Static text: it is the same answer for every member of every church. Belongs in the 🔒 Privacidade item (bot) and repeated inside the export file. **Today's Privacidade text does not mention sharing at all** — this is the gap that forces a text revision | Text only |
| **VIII/IX — consentimento** | Not applicable in the shape assumed here: the church does not process on consent, it answers people who wrote to it first. Naming the legal basis is a lawyer's job, not this document's | Out of scope |

---

## Decisions (and why)

| Decision | Choice | Reasoning / trade-off |
|---|---|---|
| Delete semantics | **Hard delete. No anonymisation.** | An "anonymised" thread sitting beside a phone-less contact row is trivially re-identifiable from its own contents (a prayer naming a spouse and a neighbourhood). Art. 12 only exempts data whose re-identification takes unreasonable effort. There is no analytics product that would justify keeping husks, and anonymising means several UPDATEs where deleting means one statement. |
| Atomicity of a member deletion | **One `DELETE FROM contact` statement; the FK cascades do the rest.** | `message.contact_id` and `prayer_request.contact_id` are both `ON DELETE CASCADE` (`schema.ts:82`, `schema.ts:96`). A single statement in Postgres runs in an implicit transaction, so the cascade is atomic **even though `neon-http` has no `db.transaction`**. This is the whole answer to "a multi-table delete will fail halfway": there is no multi-table delete. A half-deleted member is designed out rather than compensated for. |
| Audit record ordering | **Insert the record as `pending` → delete → mark `done`.** | If the record insert fails, nothing is deleted and the secretary retries — clean. If the delete fails, a visible `pending` record says so and the retry is safe because deleting an already-deleted contact affects zero rows. Refusing to erase when the proof cannot be written costs nothing real: both writes go to the same database, so a failing record insert means the delete would have failed too. |
| Audit record content | Counts, timestamps, the acting staff email, and an **HMAC of the phone** — never the phone, name, or any body text | The record must survive the data. A record that stored the number would be a phone-number list of exactly the people who asked to be erased. The HMAC (keyed by `ERASURE_HASH_SECRET`) still lets the church answer "sim, o número X foi apagado em 12/03" when the member returns. It remains *pseudonymised*, hence still personal data — retained under Art. 16 I as the accountability record Art. 6 X demands. |
| Missing `ERASURE_HASH_SECRET` | The delete **proceeds**, storing a null hash | Fails toward the member's right, mirroring `effectiveStatus`'s fail-toward-service (`src/lib/church-status.ts:12`). A missing operator env var must never be the reason a statutory erasure does not happen. |
| Suspension gate | **Export and delete are exempt.** They re-check that the admin still exists, but not that the church is paying | `requireWritableSession` blocks suspended churches (`src/lib/auth/writable.ts:29-31`). Routing data-subject actions through it would make a vendor billing dispute the reason a controller misses a statutory deadline — and the fine lands on the church, not on Rafael. This grants no new reading power: `requireReadableSession` already lets a suspended church read every message and prayer (`writable.ts:62-84`); export is a formatted read of the same rows. |
| Blocking future contact | **No blocklist.** A deleted member who writes again is a new person | The only way to stop future processing is to keep the phone number in a blocklist — retaining the exact identifier we were asked to erase, forever. The member already holds the real control: they can stop writing, or block the number in WhatsApp. Stated plainly in the Privacidade text so nobody is misled. |
| Purge scope | Messages **and prayer requests** and idle contacts | This reverses the earlier spec's "prayer requests are exempt from the automatic purge" (`2026-08-06-multi-church-saas-design.md:113`). Keeping the single most sensitive column the longest is indefensible under Art. 6 III (necessity), and it contradicts the owner's instruction that member data is purged at 12 months. **Owner must confirm** — churches may value their prayer history. |
| Purge measurement | `message.created_at`, `prayer_request.created_at`, and `coalesce(contact.last_inbound_at, contact.created_at)` | `last_inbound_at` is written by a *separate statement* from the contact insert (`webhook/route.ts:80` then `:98`), so with no transactions it can legitimately be null on a real row. Coalescing to `created_at` (NOT NULL, `schema.ts:74`) means such a row still ages out instead of living forever. |
| Purge atomicity | Many small idempotent statements, no compensation | The asymmetry with erasure is deliberate. A half-finished *erasure* is malignant: a member was told "apagamos" and half their data remains. A half-finished *purge* is benign: every deleted row is a completed unit of work, the predicate is absolute (`created_at < now − 12 months`), and tomorrow's run finishes the backlog. Resumability needs no cursor and no state table. |
| Export storage | Generated per request, streamed as a download, **never written to Blob, disk, or email** | Vercel Blob URLs are public-by-URL and permanent — that is exactly why the menu-image flow works. A member export placed there would be a durable, unauthenticated, church-unscoped copy of the most sensitive rows in the system. The export is the one artifact where a convenience shortcut is a breach. |
| Export format | JSON, with **pt-BR keys** | Art. 18 V asks for an interoperable, common format; JSON is that. The keys are user-facing text handed to a Brazilian member, so the binding pt-BR rule applies to them (unlike code identifiers). The panel also renders the same content on screen, which satisfies Art. 19 §2's electronic-or-printed option without a second format. |
| Correction (III) | Name yes; message and prayer bodies no | A conversation log is a record of an event. Editing what someone said destroys the only value the record has and would let a church rewrite a member's words. The remedy for a wrong or regretted prayer request is deletion of that request, not rewriting it. |
| Deletion granularity | Whole member only. No per-message delete | Two reasons: a per-row delete cannot be made atomic against its audit record without the same machinery for a much smaller benefit, and "apague aquela mensagem" is nearly always "apague tudo". A single prayer request can be removed by deleting the member and letting them start over — stated in the panel copy. |
| Cron authentication | `Authorization: Bearer $CRON_SECRET`, timing-safe compare; **refuse to run if the secret is unset** | The deliberate inversion of this codebase's fail-open habit. Every other guard fails toward service; this one guards a destructive, unauthenticated-by-default endpoint. An open `/api/cron/purge` is a delete button on the public internet. |
| Cross-church query privilege | New system-only module `src/lib/repo/retention.ts`, importable by **exactly one file** | The purge must span churches, and `src/app/api/**` may not import `src/lib/repo/platform.ts` — a rule `tests/privilege-boundary.test.ts:24-35` enforces by resolving every specifier. Rather than smuggle the cron route outside the scanned roots, this opens a *named, single-importer* hole enforced by the same test. `platform.ts` stays importable by nothing. |

---

## Schema changes

One new enum pair and one new table. Migration **0004** — a new file; `0000`–`0003` are never touched.

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
```

Column notes:

- **`church_id … ON DELETE CASCADE`** — deleting a church destroys its receipts too. Correct: with no controller there is no accountability obligation, and retaining a departed customer's compliance records is retention without purpose.
- **`subject_contact_id`** — kept without an FK so the `pending → done` resume can find its target. After the delete it is a random UUID that correlates to nothing without a copy of the old database.
- **`performed_by_email`** — a text *snapshot*, not a reference to `admin_user`. An FK with `ON DELETE SET NULL` would erase the actor from the audit trail the day that secretary leaves the church, which is precisely when the record matters. Staff email retained under Art. 16 I; a staff member cannot erase their own name from a compliance log, and that is defensible.
- **`contacts_deleted`** — 0 or 1 for a subject request; the run total for a retention row.

Drizzle addition to `src/db/schema.ts` (appended; nothing existing is modified):

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
}));
```

**No other schema change.** In particular there is no `blocked_at`, no `deletion_requested_at` on `contact`, and no soft-delete flag — soft deletion is not deletion.

New environment variables (`.env.example`):

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
| `src/lib/member-export.ts` | `buildMemberExport(church, contact, messages, prayers, now)` → the exact object serialised to JSON, plus `SHARING_DISCLOSURE` and `EXPORT_NOTES` constants. Takes rows, returns a value; no database, no `Date.now()`. |
| `src/lib/erasure-hash.ts` | `hashPhone(phone: string): string \| null` — HMAC-SHA256 keyed by `ERASURE_HASH_SECRET`, `null` when the secret is absent. Normalises the number (digits only) first so the same person hashes the same way. |
| `src/lib/redact.ts` | `redactPhones(text: string): string` — replaces runs of 10–15 digits (with optional `+`) by `+55…XX`. One function, used at the two log sites named below. |

**Church-scoped repo (safe for the panel):**

| Module | Responsibility |
|---|---|
| `src/lib/repo/member-data.ts` | `loadMemberData(churchId, contactId)`, `countMemberRows(churchId, contactId)` → `{ messages, prayers, prayersNovo }`, `deleteMember(churchId, contactId)` → rows deleted (0 or 1), `renameContact(churchId, contactId, name)`, `listPrayerRequestsForContact(churchId, contactId)`. Every query carries both predicates, like every other repo here. |
| `src/lib/repo/erasure.ts` | `openErasureRecord(...)`, `completeErasureRecord(id, churchId, counts)`, `listErasureRecords(churchId, limit)`, `findErasureByPhoneHash(churchId, hash)`, `findPendingErasures(churchId)`. Church-scoped; no cross-church query. |

**System-only repo (owner/system privilege, like `platform.ts`):**

| Module | Responsibility |
|---|---|
| `src/lib/repo/retention.ts` | `listChurchIdsForPurge()`, `purgeIdleContacts(churchId, cutoff, limit)`, `purgeOldMessages(churchId, cutoff, limit)`, `purgeOldPrayers(churchId, cutoff, limit)`, `sweepPendingErasures(olderThan)`. Cross-church by construction. **Importable only by `src/app/api/cron/purge/route.ts`** — enforced by an explicit amendment to `tests/privilege-boundary.test.ts`. |

**Entry points:**

| File | Responsibility |
|---|---|
| `src/app/admin/(protected)/caixa/[contactId]/dados/page.tsx` | The member data page. Uses `requireReadableSession` — mandatory, `tests/privilege-boundary.test.ts:121-135` fails any protected page that does not. |
| `.../dados/actions.ts` | `deleteMemberData(contactId, formData)` and `renameMember(...)`. Uses the new `requireDataRightsSession`. |
| `src/app/api/dados/[contactId]/route.ts` | GET → the export file. Uses `checkDataRightsSession`, the non-redirecting variant: a route handler that let `NEXT_REDIRECT` escape would serialise a framework control-flow signal into its own body — the exact bug already fixed once at `src/app/api/blob/upload/route.ts:9-25`. |
| `src/app/api/cron/purge/route.ts` | Bearer-authenticated purge runner. The only importer of `repo/retention.ts`. |
| `src/lib/auth/writable.ts` | Gains `requireDataRightsSession()` (actions) and `checkDataRightsSession()` (route handlers): the existing revocation re-check **without** the suspension check. Implemented by splitting the current `verifyWritable` into `verifyIdentity` (admin still exists, still this church) + the status test, so the two guards cannot drift apart. |
| `src/app/admin/(protected)/configuracoes/page.tsx` | Gains a "Retenção e exclusões" panel: the retention statement, the last records, and the hash-verification box. |
| `src/app/owner/(protected)/[churchId]/actions.ts` | Gains `updatePrivacyText(churchId)` — rewrites the 🔒 Privacidade body **only** if it is byte-identical to a previous seeded default. |
| `vercel.json` | New file. One cron entry. |

**Two small fixes that belong to this subsystem** (they are the "where the data is" table made true):

- `src/lib/repo/contact.ts:49` — drop `phone=${phone}` from the thrown message; log `churchId` and the phone hash instead.
- `src/app/api/whatsapp/webhook/route.ts:180` — wrap the logged error in `redactPhones(...)`, because a Postgres unique-violation message carries the conflicting key values.

---

## Erasure: the flow

```
Secretary opens /admin/caixa/<id>/dados
  → sees counts, reads the warnings, types APAGAR
  → deleteMemberData(contactId)
       1. requireDataRightsSession()            revocation checked, suspension not
       2. countMemberRows(churchId, contactId)  what the receipt will claim
       3. openErasureRecord(...)  status=pending, subject_phone_hash=hashPhone(phone)
       4. deleteMember(churchId, contactId)     ONE statement, cascades, atomic
       5. completeErasureRecord(id, churchId)   status=done, completed_at=now
```

**Per table, concretely:**

| Table | What happens |
|---|---|
| `contact` | Row deleted. Phone and name gone. |
| `message` | Every row for that contact deleted by the FK cascade — inbound and outbound, bodies and `wa_message_id`. |
| `prayer_request` | Every row deleted by the cascade, **including rows still marked `novo`**. The church loses prayers it has not yet prayed for; the confirmation screen says so with a count, because that is a real cost the secretary should absorb knowingly. |
| `menu_item`, `church`, `admin_user` | Untouched. No member data lives there. |
| `erasure_record` | Gains one row. Holds no phone, no name, no body. |

**In-flight conversation and the 24h window.** Deleting a contact in `human` mode removes the thread, `last_inbound_at`, and therefore the panel's ability to reply at all — `sendReplyToContact` needs a conversation row and an open window (`src/app/admin/(protected)/caixa/actions.ts:28-33`). The design does **not** block deletion for an in-flight handoff: the member's right outranks the church's convenience. It warns instead, and tells the secretary to say whatever they need to say *before* pressing the button. After deletion the church has no way to message that number from the product.

**Deletion does not stop future processing.** The next inbound message from that number recreates the contact via `findOrCreateContact` with `greeted_at = null`, so the person is greeted as a first-time contact and a fresh history begins. This is the correct behaviour under the no-blocklist decision, and both the panel copy and the Privacidade text state it.

**Idempotence.** A second delete affects zero rows; the action reports "já haviam sido apagados" and writes no second record.

---

## The 12-month purge

**Cutoff:** `now − 365 days`, from `src/lib/retention.ts`. Calendar-month drift is a day and does not matter; a pure constant is testable and one place to change.

**Per church, in this order** (order matters — step 1 makes steps 2 and 3 cheaper):

1. `DELETE FROM contact WHERE church_id = $1 AND coalesce(last_inbound_at, created_at) < $cutoff` — cascades their messages and prayers. Idle members leave nothing behind, not even a phone number with no purpose.
2. `DELETE FROM message WHERE church_id = $1 AND created_at < $cutoff` — old messages of still-active members.
3. `DELETE FROM prayer_request WHERE church_id = $1 AND created_at < $cutoff` — same.

**Kept:** the church row and its texts, the menu, staff accounts, and the `erasure_record` history. **Purged:** everything about the member.

**Batching.** Postgres has no `DELETE … LIMIT`, so each statement is issued as `DELETE … WHERE id IN (SELECT id FROM … LIMIT 500)` and looped until it deletes fewer than 500 rows or a wall-clock budget expires. `neon-http` is one HTTP round trip per statement, so 500 keeps round trips low without producing a statement that runs long. `maxDuration = 60` on the route; the loop stops at 45 s and returns `{ done: false }`.

**Idempotent and resumable by construction.** The predicate is absolute time, not a cursor. Running twice in a row deletes nothing the second time. A run cut short by the platform's timeout leaves the remainder for tomorrow, and because the cutoff keeps moving forward, a missed day is a one-day retention overrun, not a permanent gap. Nothing needs to be persisted between runs.

**Also swept each run:** `erasure_record` rows still `pending` more than 15 minutes old. The sweep re-runs the delete for `subject_contact_id` (zero rows if it already succeeded) and marks the record `done`. This is what makes the pending-first ordering safe: an interrupted erasure completes itself without anyone noticing it broke.

**Scheduling.**

```json
{ "crons": [{ "path": "/api/cron/purge", "schedule": "0 6 * * *" }] }
```

06:00 UTC = 03:00 in Brasília. Vercel cron schedules are UTC and, on the Hobby plan, fire within the hour rather than at the minute — irrelevant for a job whose cutoff is measured in months.

**Suspension is ignored.** A suspended church's data still ages, and retention is the controller's legal obligation, not a product feature to be withheld over billing. This does not contradict "never delete a church's data over billing" — nothing here is deleted *because of* billing.

**Is the church told?** Yes, passively. A retention row is written **only when something was actually deleted**, and Configurações shows the last runs: *"07/08/2026 · Limpeza automática (12 meses) · 1.240 mensagens, 12 pedidos de oração, 3 cadastros apagados"*, above a standing sentence explaining that the cleanup runs daily. No email, no WhatsApp message: a monthly "we deleted your members' data" email to a church secretary is alarming, unactionable, and would itself need a delivery channel this product does not have.

**At launch this job deletes nothing.** No row in the system is a year old, and none will be for a year. The batching is insurance for the day a church crosses the boundary with a year of accumulated history.

---

## Export and portability

**Trigger:** the secretary, from the member page. Never the member directly, never the vendor.

**Delivery:** `GET /api/dados/<contactId>` responds with `Content-Type: application/json; charset=utf-8`, `Content-Disposition: attachment; filename="dados-membro-<first-6-of-uuid>-<yyyy-mm-dd>.json"`, and `Cache-Control: no-store`. The filename carries no phone and no name — it lands in a shared secretariat's Downloads folder. The URL carries only the contact UUID, which is already in `/admin/caixa/<contactId>` today; no personal data ever goes in a query string.

**Isolation:** the handler resolves `churchId` from the session and calls the church-scoped loaders, so another church's `contactId` returns 404 — the same two-predicate pattern `tests/repo-isolation.test.ts` already exercises for `loadConversation`.

**Shape** (keys pt-BR, because a member reads them):

```json
{
  "gerado_em": "2026-08-07T09:00:00.000Z",
  "igreja": "Igreja Exemplo",
  "titular": {
    "nome": "Maria",
    "whatsapp": "5511999998888",
    "primeiro_registro": "2026-01-04T18:22:00.000Z",
    "ultima_mensagem_recebida": "2026-08-01T13:40:00.000Z"
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

`wa_message_id` and internal UUIDs are excluded — they mean nothing to the member and one of them may encode their phone number.

**What makes this not a new leak:** nothing is written to Blob, to disk, or to a queue; the response is built in memory and streamed; the file exists only in the secretary's browser. The panel copy tells them to hand it only to the person and delete it afterwards — the one control that lives outside the software, said out loud rather than assumed.

---

## Auditability (Art. 6 X, demonstrability)

The evidence chain is three things, none of which is a copy of the deleted data:

1. **`erasure_record`** — for each subject request: when, why, by which staff email, how many rows of each kind, and an HMAC of the number. For each retention run that deleted something: when, and how many rows. Enough to answer ANPD's "prove you did it" without reconstructing anything.
2. **The hash-verification box** in Configurações — the church types a number, the panel hashes it and looks it up. The proof works for the returning member, not just for the regulator.
3. **The test suite** — the existing cross-tenant isolation suites plus the new erasure/purge suites run on every commit. Art. 6 X asks the controller to demonstrate that controls work; a passing suite is that demonstration, and it is the argument the previous spec already staked out.

What the record deliberately cannot do: tell you what the member said, what they were called, or what number they used. If someone with database access wants to know who was erased, they need `ERASURE_HASH_SECRET` and a candidate number to test — a guessing game, not a list.

---

## The 🔒 Privacidade text

The current text (`src/lib/church-defaults.ts:31-45`) needs three changes and one removal:

1. **Sharing (Art. 18 VII) is missing entirely.** It must be there.
2. **Retention names only "as conversas"** — the purge also deletes prayer requests, and the promise should cover what the system does.
3. **The consequence of deletion** — that a new message starts a new history — is not stated, and members must not believe deletion is a permanent block.
4. **`_Edite este texto no painel._` is addressed to the secretary but is read by members.** It goes; the same guidance moves to the Conteúdo page as panel copy.

**New `PRIVACY_ITEM.bodyText`, verbatim (913 characters — deliberately under the 1024 WhatsApp image-caption cap, so the text still sends if a church attaches an image to this item, `src/lib/whatsapp.ts:24-26`):**

```
*Privacidade e seus dados*

Seus dados são tratados de acordo com a LGPD (Lei nº 13.709/2018).

*O que guardamos:* seu número de WhatsApp, seu nome no WhatsApp, as mensagens desta conversa e, se você enviar, seu pedido de oração.

*Por quê:* para responder às suas dúvidas e atender aos seus pedidos.

*Por quanto tempo:* as conversas e os pedidos de oração são apagados automaticamente após 12 meses.

*Com quem compartilhamos:* apenas com os serviços que fazem este atendimento funcionar — o WhatsApp (Meta) e as empresas que hospedam nosso sistema. Não vendemos nem cedemos seus dados.

*Seus direitos:* você pode pedir a qualquer momento uma cópia dos seus dados, a correção do seu nome ou a exclusão de tudo. Fale com a secretaria da igreja.

A conversa também fica no seu aparelho e nos servidores do WhatsApp, fora do nosso controle. E se você escrever de novo depois da exclusão, um novo histórico começa.
```

It still says data is handled *in accordance with* the LGPD — a statement about practice — and never that the app "is compliant". The word "dízimo" does not appear anywhere in this subsystem.

**Rollout.** `PRIVACY_ITEM` is a *seed*: each church holds its own editable `menu_item` row, so changing the constant updates nobody. `src/lib/church-defaults.ts` therefore keeps the previous body frozen as `PRIVACY_ITEM_V1_BODY`, and the owner console gains **"Atualizar texto de Privacidade"**, which rewrites the row only when its current body is byte-identical to a known previous default. A church that edited its own text is never overwritten — the vendor may replace vendor-authored text, never the controller's own words. Churches whose text was edited are listed in the owner console so Rafael can call them. With one church live today this costs one click.

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
| Record insert failed | `Não foi possível registrar o comprovante de exclusão. Nada foi apagado — tente novamente.` |
| Delete failed after record opened | `A exclusão foi iniciada mas não terminou. Ela ficou marcada como pendente e será concluída automaticamente; você também pode tentar de novo agora.` |
| Generic delete failure | `Não foi possível apagar os dados. Tente novamente.` |
| Pending banner | `Exclusão pendente desde {data}. Tente novamente para concluir.` |

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
| Subject-request row | `{data} · Pedido do titular · {n} mensagens, {n} pedidos de oração · por {email}` |
| Pending suffix | ` · pendente` |
| Verify box title | `Verificar uma exclusão` |
| Verify field label | `Número de WhatsApp` |
| Verify button | `Verificar` |
| Verify found | `Sim. Os dados deste número foram apagados em {data}.` |
| Verify not found | `Nenhuma exclusão registrada para este número.` |
| Verify unavailable | `A verificação não está disponível nesta instalação.` |
| Verify hint | `O número apagado não fica guardado. A verificação usa uma impressão digital (hash) do número.` |

**Export route errors** (JSON body) — reuses `UNAUTHENTICATED_MESSAGE` and `REVOKED_MESSAGE` from `src/lib/auth/writable.ts:86-99`, plus:

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
| `openErasureRecord` throws | Nothing is deleted. Secretary sees "Nada foi apagado — tente novamente." | Both writes hit the same database; if the record cannot be written, the delete would not have committed either. No state to reconcile. |
| `deleteMember` throws after the record opened | A `pending` record exists, the data is intact. The page shows the pending banner; the daily sweep completes it; the secretary can retry immediately. | Delete is idempotent, so the retry is always safe. The pending row is a visible alarm rather than a silent inconsistency. |
| `completeErasureRecord` throws after a successful delete | Data is gone; record stays `pending`. The sweep deletes zero rows and flips it to `done`. | The dangerous direction — a `done` record over surviving data — is impossible by ordering. |
| Member writes at the same moment as the delete | A fresh contact row appears seconds later; the record's counts describe the state observed immediately before the delete. | The record is proof of an act, not an inventory. Off-by-one under a genuine race is honest; the alternative (counting deleted rows exactly) would require deleting each table separately and reintroduce the half-deleted member. |
| `ERASURE_HASH_SECRET` unset or rotated | Erasure proceeds; hash stored as `null`, or old records stop matching. Verify box answers `A verificação não está disponível nesta instalação.` | Never block a statutory erasure on an operator env var. Counts and timestamps remain valid evidence. |
| Purge run times out mid-batch | Partially purged; next run continues. | Every deleted row is a completed unit; the predicate is absolute, so the work converges without state. |
| Cron does not fire for days | Retention overruns by those days; the next run deletes the whole backlog. | A bounded, self-healing overrun. Visible in Vercel's cron log. **Accepted risk:** there is no in-product alarm for a dead cron. |
| `CRON_SECRET` unset | Endpoint refuses (503) and logs loudly; no purge runs. | Deliberate inversion of fail-open. An unauthenticated purge endpoint is a public delete button. |
| Someone POSTs `/api/cron/purge` without the token | 401, nothing runs. Constant-time comparison, as in `verifySignature` (`src/lib/whatsapp.ts:88-100`). | Same discipline the WhatsApp webhook already uses. |
| Export requested for another church's contactId | 404 with `Conversa não encontrada.` | Church-scoped loaders; the isolation pattern the repo suite already verifies. |
| Export requested while the church is suspended | Succeeds. | Deliberate — see the suspension-gate decision. Grants no new reading power. |
| Privacidade text lengthened past 1024 by a church that also attaches an image | Graph API 400 on that item; the member gets the error text instead of the notice. | Pre-existing behaviour of image captions, newly reachable because v2 is longer. Mitigated by keeping v2 at 913 characters; a length warning on the item form is a follow-up, not part of this spec. |
| A church deletes its own Privacidade item | Members lose the notice. `PrivacyItemWarning` only fires at zero menu items (`src/app/owner/(protected)/[churchId]/page.tsx:35`), so this is invisible. | **Named gap.** The right fix is an owner-console check for "has an item whose body mentions privacidade" — out of scope here, worth a backlog entry. |

---

## Testing

All on PGlite with real migrations, plus pure unit tests — the existing pattern.

- **`retention.ts`** — cutoff boundary: a row exactly 365 days old, one second younger, one second older, and a null `last_inbound_at` falling back to `created_at`.
- **Cascade atomicity** — insert a contact with messages and prayers, run the single `DELETE`, assert all three tables are empty for that contact and that the other church is byte-identical. This extends the cascade assertion `tests/tenant-isolation.test.ts:167` already makes at the church level.
- **Erasure ordering** — force the delete to throw, assert the record is `pending` and the data intact; then run the sweep and assert `done` and gone.
- **Idempotence** — delete twice; second call reports "já apagados" and writes no second record.
- **Purge** — two churches, mixed ages, assert only rows past the cutoff disappear and the other church is untouched; run twice and assert the second run deletes nothing; run with a batch limit of 1 and assert convergence.
- **Export** — `buildMemberExport` is pure: assert `wa_message_id` and internal UUIDs are absent, direction maps to `membro`/`igreja`, and null bodies survive as `null`.
- **Cron auth** — missing header, wrong token, right token, unset `CRON_SECRET`.
- **Isolation** — every new repo function added to `tests/repo-isolation.test.ts`'s two-church attack list.
- **Privilege boundary** — amend `tests/privilege-boundary.test.ts` so `repo/retention.ts` is importable only by the cron route, and assert the negative: the webhook and the admin panel cannot reach it.
- **Redaction** — `redactPhones` on a Postgres unique-violation message containing `(church_id, phone)=(…, +5511999998888)`.

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
- Deleting a church's data on cancellation, and staff (`admin_user`) data-subject requests. Staff removal already hard-deletes the row (`src/lib/repo/admin.ts:34`); the audit email snapshot deliberately survives it.
- An in-product alarm for a dead cron.

## What cannot be verified here

Nothing in this repository has ever run against Neon, Meta, Vercel, or a browser. Specifically unverifiable until it does:

- **That the cascade deletes at production scale in one statement within Neon's limits.** The behaviour is proven on PGlite; a contact with tens of thousands of messages on a real Neon connection is not.
- **Vercel cron behaviour** — that the platform actually invokes the path, sends `Authorization: Bearer $CRON_SECRET`, and that `maxDuration` on the current plan permits the 45-second budget. Hobby-plan crons also fire within the hour rather than on the minute.
- **Vercel log retention** — how long a leaked phone number survives in the runtime logs, and therefore how urgent the two redaction fixes are. Plan-dependent and not observable from here.
- **Neon point-in-time restore window** — a deleted row remains recoverable inside it. The Privacidade text does not claim instant, universal erasure, but the exact window is a fact only the live account has.
- **That `wamid` values encode the member's phone number.** Treated as if they do. Confirming it needs a live Meta app.
- **Stripe is not involved in this subsystem.** The only personal data at Stripe is the church's billing contact — staff, not members. Any claim about what Stripe holds or how it is deleted is unverifiable without a live account and belongs to the billing plan.
- **Whether 12 months is the right number.** It is a product decision reflected in an existing promise, not a legal determination.

## What the owner must decide before implementation

1. **Do prayer requests get purged at 12 months?** This spec says yes, reversing the earlier design's exemption. If churches would object to losing their prayer history, the alternative is a longer, separately-stated period — but the Privacidade text must then say so.
2. **How long do `erasure_record` rows live?** This spec keeps them for as long as the church exists. A five-year cap is arguable; destroying your own proof is worse than keeping a hash.
3. **Is a staff email in a permanent audit log acceptable?** The alternative loses "who did it" the day that person leaves.
4. **Who holds `ERASURE_HASH_SECRET` and `CRON_SECRET`,** and what happens on rotation.
5. **The privilege-boundary amendment** — this is the first named exception to an absolute rule, and it should be approved deliberately rather than noticed in review.
