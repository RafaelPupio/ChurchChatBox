# Secretária Virtual — Stripe Billing

**Design doc** · 2026-08-07 · Status: proposed · **Revision 2** (see Revisions)

## Overview

Today a church's subscription lifecycle is a column somebody types into. `church.status` exists, `grace_until` exists, `effectiveStatus()` reads them correctly — and the only thing that ever writes them is Rafael clicking a button in `/owner`. This subsystem makes Stripe do the writing.

**The vendor provisions, Stripe bills.** Rafael creates each church from `/owner` exactly as he does now. Stripe's only job is to charge an already-provisioned church and drive its `status` automatically. There is no public signup, no public pricing page, and no checkout route on our domain.

### What "done" means

1. Rafael can turn a provisioned church into a paying subscriber without leaving `/owner` and without ever touching the church's card.
2. A failed payment moves the church to `past_due` with a real 7-day deadline, and a recovered payment moves it back to `active` — with no human involved on either edge.
3. The Stripe webhook rejects forged payloads, survives duplicate and out-of-order delivery, and never loses an event to a crash between "received" and "applied".
4. When a webhook is missed entirely, a reconciliation pass detects the drift and repairs it, **makes measurable forward progress on every run**, and the fact that reconciliation itself has stopped running is visible in `/owner` rather than silent.
5. Rafael can keep any church running regardless of what Stripe thinks, with the reason recorded — and an overridden church stays *observable* while it is frozen.
6. The church sees enough to fix its own expired card and nothing more.
7. Price and trial length live in the Stripe dashboard. No amount, currency, interval, or day-count appears in this repository.

### What already exists (verified, not assumed)

| Thing | Where | State |
|---|---|---|
| `status` enum, `stripe_customer_id`, `stripe_subscription_id`, `grace_until` | `src/db/schema.ts:21-24` | Columns exist, shipped in migration `0001` |
| `effectiveStatus(status, graceUntil, now)` and `GRACE_PERIOD_MS` | `src/lib/church-status.ts:5-21` | Pure, tested, fails toward service |
| Suspended church records everything, sends nothing | `src/app/api/whatsapp/webhook/route.ts:152-154` | Single early return below all recording |
| Panel goes read-only when suspended | `src/lib/auth/writable.ts:29-31` | `requireWritableSession` returns `{ blocked: 'suspended' }` |
| Panel banners for `past_due` / `suspended` | `src/app/admin/(protected)/layout.tsx:32-42` | Already rendered on every protected page |
| Manual status control | `src/lib/repo/platform.ts:82-97`, `src/app/owner/(protected)/[churchId]/StatusControls.tsx` | Writes `grace_until = now + 7d` on `past_due` |
| Church admins cannot write `status` or `stripe_*` | `src/lib/repo/church-admin.ts:17-29` | 11-column allowlist |
| `/admin/configuracoes` already guarded | `src/app/admin/(protected)/configuracoes/page.tsx:1,9` | Already imports and calls `requireReadableSession` |

The lifecycle is complete. Only its driver is missing. **Nothing in this document invents a new status model** — every Stripe event lands on `active` / `past_due` / `suspended` and on the existing grace period.

## Decisions taken (and why)

| Decision | Choice | Reason |
|---|---|---|
| Who starts the subscription | Rafael, from `/owner`, generating a one-shot Stripe Checkout link he sends by WhatsApp | Settled by the owner. A server-created session carries `client_reference_id` set by us, not by an editable query string, so a church cannot pay another church's bill. It expires, so a leaked link is not a standing public checkout. |
| Where the card is entered | Stripe-hosted Checkout, never our UI, never Rafael | Card data must not enter this app's PCI scope or Rafael's hands. |
| What drives status | **`customer.subscription.*` only** — one event family, one state machine | `subscription.status` is a *state*; `invoice.paid` / `invoice.payment_failed` are *edges*. Replaying an edge out of order flips a church wrongly; re-applying a state does not. This single choice is what makes out-of-order delivery a non-event. |
| Trusting the event payload | No — the handler re-fetches the subscription from Stripe and applies **that** | An event carries the object as of when the event was created. Two updates delivered out of order would apply the older one last. Re-fetching makes the last writer apply current truth, so ordering stops mattering at all. Costs one API call per event, at a volume of dozens of churches. |
| Response code discipline | Non-2xx on transient failure (Stripe retries); 200 on "handled" **and** on "will never be handleable" | The exact opposite of the WhatsApp webhook, which always answers 200 because a Meta retry means a real person is messaged twice (`src/app/api/whatsapp/webhook/route.ts:37-40`). A Stripe retry is free and is the repair mechanism. But retrying for three days cannot conjure a church row, so unmatched events get 200 and a repair queue. |
| Idempotency claim | `stripe_event` row keyed on Stripe's `evt_…` id, with a `processed_at` watermark | The insert is the claim. A retry that finds `processed_at IS NULL` **re-processes** rather than skipping — see "No transactions" below. |
| Source of truth | Stripe owns *whether the church is paid up*; `church.status` is a projection of that; `billing_override` is a deliberate, recorded divergence | Anything else means two systems both believing they are authoritative. |
| Manual override | A boolean + required note on `church`, **not** a fourth status. It **freezes** the stored status; it does not force `active` | The constraint is explicit: no parallel status model. Override is orthogonal to status — it says "nothing from Stripe may overwrite this", not "the church is in a new state". |
| How the override is enforced | A `CASE` inside the one apply statement, **not** a `WHERE` predicate | A `WHERE billing_override = false` excludes the whole row, which also freezes the mirror columns and makes an overridden church permanently look like a dead webhook. The `CASE` freezes only `status` and `grace_until` while the mirrors still land — in one statement, so atomicity survives. Verified against real Postgres; see "The apply statement". |
| Reconciliation cadence | Daily Vercel Cron, plus a `/owner` button, plus a CLI | The multi-church spec rejected cron for *grace expiry*, and that stands — grace is still computed on read. This cron is a **repair** pass: if it never runs, the system is exactly as correct as the webhooks made it. Its own liveness is visible as `stripe_synced_at` age in `/owner`, so a dead scheduler shows up in the UI instead of failing silently. |
| Reconciliation ordering | Oldest-attempt-first cursor, an explicit per-run cap, and a declared `maxDuration` | An unordered full walk that dies on a timeout dies at the same place every run, so the tail of the list is never reconciled at all. Ordering by attempt age makes every run advance the frontier. |
| Stripe API key | Env var, platform-wide | There is one Stripe account for all churches. It is a *vendor* credential, unlike the Meta credentials, which are per-church rows because each church has its own number. |
| Stripe SDK surface | Split in two: an owner-only general client and a narrow church-safe `stripe-portal.ts` | "Anyone may import the Stripe client" hands cross-church capability to church-facing code in the one subsystem whose entire safety story is the privilege test. |
| Trial | Card collected up front even during a trial (`payment_method_collection: 'always'`) | A trial that ends with no card produces `incomplete`, a dark bot, and a confused pastor — after Rafael has already spent days on Meta verification. Fewer trial starts is the right trade for a sales-assisted product. |
| Dispute / refund | Recorded, surfaced, **no automatic status change** | Auto-suspending a church mid-conversation over a disputed charge is worse than the amount in dispute. If Rafael wants them off, he cancels in Stripe and the normal path handles it. |
| Billing Portal scope | Update payment method + view invoices only; **cancellation disabled** in the portal configuration | Otherwise a church cancels itself at 2am and the bot goes dark with no human in the loop. This is dashboard configuration, and it is a launch prerequisite, not a nicety. |
| Collection method | `charge_automatically` (card) | See the PIX/boleto note. Chosen because it is the only method with automatic recovery. |

## Architecture

### Schema changes

One new migration, `drizzle/0004_*.sql`, generated by `npm run db:generate`. Migrations `0000`–`0003` are never edited.

**`church` gains seven columns:**

| Column | Type | Null | Purpose |
|---|---|---|---|
| `stripe_subscription_status` | `text` | yes | The raw Stripe status string, last seen. Deliberately **not** an enum: Stripe adds statuses (`paused` arrived after `unpaid`), and a new one must not require a migration before we can even display it. |
| `stripe_current_period_end` | `timestamptz` | yes | What `/owner` and the church panel show as "próxima cobrança". Display only — nothing branches on it. |
| `stripe_cancel_at` | `timestamptz` | yes | Set when the subscription is scheduled to cancel at period end. Display only; the church keeps working until `deleted` arrives. |
| `stripe_synced_at` | `timestamptz` | yes | When we last **successfully confirmed** this church against Stripe, by webhook or reconciliation. Drives the staleness warning. |
| `stripe_sync_attempted_at` | `timestamptz` | yes | When reconciliation last **tried**, successful or not. Drives the reconciliation cursor. |
| `billing_override` | `boolean NOT NULL DEFAULT false` | no | While true, no Stripe event or reconciliation may write `status` or `grace_until`. Mirror columns still update. |
| `billing_override_note` | `text` | yes | Why. Required by the action that sets the flag; nullable in the schema because every existing row predates it. |

**Why `stripe_synced_at` and `stripe_sync_attempted_at` are two columns and not one.** They answer two different questions and merging them breaks one of the answers. `stripe_synced_at` means "the last time this row was known to match Stripe" — that is what the staleness warning must read, and a failed attempt must *not* reset it or a permanently broken church would look freshly checked. `stripe_sync_attempted_at` means "the last time we spent an API call on this church" — that is what the reconciliation cursor must read, because a church whose retrieve always throws would otherwise sort first forever and starve the rest of the list. One column cannot be both honest about health and monotonic about progress.

**Two new unique indexes**, matching the existing reasoning at `src/db/schema.ts:37-49`:

```
church_stripe_customer_id_uq     UNIQUE (stripe_customer_id)
church_stripe_subscription_id_uq UNIQUE (stripe_subscription_id)
```

Both columns are nullable and Postgres allows many NULLs under a unique index — any number of churches may be unbilled, but no two may share a Stripe identity. A duplicate `cus_…` makes church resolution non-deterministic, which means one church's payment could activate another's bot. Exactly the `phone_number_id` argument, applied to a different external identifier.

**New table `stripe_event`:**

| Column | Type | Notes |
|---|---|---|
| `id` | `text PRIMARY KEY` | Stripe's `evt_…`. The natural key; the insert *is* the idempotency claim. |
| `type` | `text NOT NULL` | e.g. `customer.subscription.updated`. |
| `church_id` | `uuid REFERENCES church(id) ON DELETE SET NULL` | Nullable — an event may name no church we know. |
| `stripe_object_id` | `text` | The id of the object the event was actually about: `sub_…`, `ch_…`, `dp_…`, `cs_…`. The audit trail. |
| `stripe_customer_id` | `text` | The `cus_…` resolved for this event, when one was resolvable. |
| `stripe_subscription_id` | `text` | The `sub_…` resolved for this event, when one was resolvable. |
| `outcome` | `stripe_event_outcome NOT NULL DEFAULT 'received'` | New pgEnum: `received` \| `applied` \| `recorded` \| `ignored` \| `unmatched` \| `failed`. |
| `error` | `text` | Last failure message, for `failed`. |
| `attempts` | `integer NOT NULL DEFAULT 0` | Incremented on each processing attempt. |
| `received_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `processed_at` | `timestamptz` | **Null means the claim was made but the work is unproven.** The whole no-transaction story hangs on this column. |

**Three id columns, not one.** An earlier draft had a single `stripe_object_id` described as "the `sub_…` or `cus_…`". That cannot serve the repair queue: for every `customer.subscription.*` event the stored value is a `sub_…`, so the "Eventos sem igreja" list would print a subscription id under a **cliente** label and give Rafael nothing to bind with. The object id is the audit record of *what the event was*; the customer and subscription ids are the *resolution keys*, and they are what the UI and the reconciler read. They are stored separately because they are different facts.

**`recorded` is a distinct outcome from `applied`.** `applied` means the apply statement ran and the church row was written from Stripe's current state. `recorded` means the event was matched to a church and filed for a human to look at, deliberately changing nothing — which is exactly what a dispute or a refund does. Collapsing them would make `/owner` claim a dispute changed the church's status.

**Two new indexes on `stripe_event`:** `(church_id, received_at DESC)` for the per-church "Últimos eventos" list, and `(outcome)` for the repair queue and the reconciler's "still `received` or `failed`" sweep. Both are queries `/owner` runs on every page load; neither is served by the primary key.

Two deliberate omissions and one deliberate exception:

- **The event payload is not stored.** Stripe billing payloads carry the paying contact's email and name and the card's brand and last four digits. That is personal data of a church officer with no retention story attached, and it is retrievable from the Stripe dashboard when a human actually needs it. We store the shape of what happened, not the record of it.
- **No `amount` column.** Money lives in Stripe. Mirroring it here creates a second ledger that can disagree with the first.
- **`ON DELETE SET NULL`, not `CASCADE`.** Every other child table cascades, and the tenant-isolation suite asserts that deleting church A removes all of A (`tests/tenant-isolation.test.ts:167`). `stripe_event` is the exception on purpose: it holds no member data, it is the vendor's financial audit trail, and Rafael needs it *after* a church leaves. The migration must be accompanied by an explicit assertion in the isolation suite that this row survives and nulls out, so the exception is tested rather than discovered.

### Components, one responsibility each

| Module | Responsibility | May be imported by |
|---|---|---|
| `src/lib/billing/stripe-status.ts` | **Pure.** `mapStripeStatus(raw: string): StatusMapping`. No I/O, no dates, no database. Mirrors `church-status.ts`. | anyone |
| `src/lib/billing/stripe-portal.ts` | The **only** Stripe surface church-facing code may reach: `createPortalSession(customerId, returnUrl)` and nothing else. Takes an explicit customer id; cannot list, search, or mutate anything. | anyone |
| `src/lib/billing/stripe-client.ts` | The general Stripe client — subscription retrieve/list, customer lookup, Checkout session creation. Lazy client construction so `next build` never needs the key, mirroring `src/db/client.ts:9-21`. Pins `apiVersion`. | **owner zone only** |
| `src/lib/repo/billing.ts` | Cross-church database access keyed on Stripe ids, and the only writer of `status` / `grace_until` / `stripe_*` outside `platform.ts`. | **owner zone only** |
| `src/lib/billing-sync/apply.ts` | "Make the database agree with Stripe for one church." Given a subscription id, re-fetch, map, write — in one statement. Shared by the webhook and the reconciler so there is one implementation of the rule. | **owner zone only** |
| `src/lib/billing-sync/reconcile.ts` | Walk a bounded, ordered page of billable churches, call `apply`, report drift. Resumable across runs. | **owner zone only** |
| `src/app/api/stripe/webhook/route.ts` | Verify the signature, claim the event, delegate, answer with the right status code. Nothing else. | — |
| `src/app/api/stripe/reconcile/route.ts` | `CRON_SECRET` guard, then call the reconciler. Declares `maxDuration`. | — |
| `src/app/owner/(protected)/[churchId]/BillingCard.tsx` + actions | Everything Rafael can do. | — |
| `src/app/admin/(protected)/configuracoes/` billing block + portal action | Everything a church can see and do. | — |
| `scripts/billing-reconcile.ts` | Operator CLI, wired as `"billing:reconcile": "tsx scripts/billing-reconcile.ts"`. English output is fine here. | — |

**Why `stripe-portal.ts` is a separate module from `stripe-client.ts`.** Both read the same platform-wide `STRIPE_SECRET_KEY` from the same process — the split does not hide the secret, and pretending otherwise would be theatre. What it buys is *capability narrowing that the privilege test can actually enforce*. The general client can enumerate customers and mutate subscriptions; a church-facing action that could import it is one careless refactor away from taking a `cus_…` out of a form and opening another church's billing portal. `createPortalSession` can only do the one thing, and the tenant check lives in the repo layer, not in prose: the customer id is read through `getChurchById(session.churchId)` — the existing church-scoped repo — and the action never accepts a customer id as input. That is a testable claim and the testing section names the test.

### The privilege boundary has to change, and honestly

`src/app/api/` is a church-facing root in `tests/privilege-boundary.test.ts:24-28`. The Stripe webhook lives under it and needs cross-church reads and `status` writes. Four things follow.

**First, the boundary widens deliberately, not by accident.** The test's model changes from "one forbidden module" to "an owner-only set and an owner zone":

```
OWNER_ONLY = { src/lib/repo/platform.ts, src/lib/repo/billing.ts,
               src/lib/billing/stripe-client.ts, src/lib/billing-sync/** }
OWNER_ZONE = { src/app/owner/**, src/app/api/stripe/**, scripts/**, OWNER_ONLY itself }
```

Everything under `src/app/admin`, `src/app/api`, `src/lib` that is not in the owner zone must not import anything in the owner-only set. `src/app/api/whatsapp/` stays blocked, which is the point: if the inbound-message path could import `repo/billing.ts`, a suspended church's own member message would run through code that can set `status = 'active'`.

**Second, `walk()` must stop skipping the allowed set.** Today `walk()` filters with `!ALLOWED.has(full)` (`tests/privilege-boundary.test.ts:44`), so the one owner-only file is never itself scanned. That was harmless with a single file. It is not harmless with an owner-only *directory*: `src/lib/billing-sync/**` would become a region of `src/lib` that no rule in the suite ever looks at — including the bare-specifier rule below, and including any rule a future contributor adds. The fix is to separate the two concerns the single set is currently doing double duty for. `walk()` returns **every** file; the rule then asks each file which zone it is in and applies the check only to non-owner files. Same outcome for `platform.ts`, and a directory can be exempted from a *rule* without becoming invisible to the *scan*.

**Third, the resolver is blind to bare package specifiers, and that now matters.** `resolveSpecifier` returns `null` for anything that is not `@/` or relative (`tests/privilege-boundary.test.ts:56`), which was correct when the only thing worth guarding was a local module. It means a church-facing file can write `import Stripe from 'stripe'`, construct its own client with `process.env.STRIPE_SECRET_KEY`, and hold full platform-wide Stripe capability while every existing assertion passes. The split in the previous section is worth nothing without this. So the suite gains a second, separate rule: **the raw specifier `stripe` (and any `stripe/…` subpath) may appear only in the owner zone and in `src/lib/billing/stripe-portal.ts`.** This is a text rule rather than a resolution rule, and it is honest about being one.

**Fourth, do not route around it.** The current test checks *direct* imports only (`tests/privilege-boundary.test.ts:78`). A thin route file that delegates to a "helper" in `src/lib/` would pass while the boundary was wide open — which is precisely the failure the brain doc records: a guard that enforces a naming convention while appearing to enforce a boundary. The implementation must inject a violation from `src/app/api/whatsapp/webhook/route.ts` — one for the owner-only rule, one for the bare-`stripe` rule — watch each go red, and revert, before the change is trusted.

## Becoming a subscriber

Rafael opens `/owner/<churchId>` and clicks **Gerar link de assinatura**. A Server Action creates a Stripe Checkout Session:

- `mode: 'subscription'`, `line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }]`
- `client_reference_id: churchId`
- `subscription_data.metadata.church_id = churchId` and `customer_creation` metadata carrying the same
- `customer: church.stripeCustomerId` when one already exists, so a re-subscribe after cancellation reuses the customer and keeps the invoice history on one record
- `payment_method_collection: 'always'`
- trial days read from the configured Price, not from a constant
- `success_url` → `/assinatura/obrigado`, `cancel_url` → `/assinatura/cancelado`

The action returns the URL **and `session.expires_at`**, and the UI renders that timestamp rather than asserting a duration. The previous draft's copy promised "Ele expira em 24 horas" while the same document listed Checkout expiry semantics as unverified — shipping an unverified number in user-facing copy is exactly the kind of claim this project does not make. Stripe returns the real expiry on the session; render it.

**It is displayed for Rafael to copy, not emailed.** We have no mail infrastructure, and sending a message on a user's behalf is not something this system should start doing as a side effect of a billing click.

**`subscription_data.metadata.church_id` is the load-bearing part.** It means every later `customer.subscription.*` event carries the church id, so `customer.subscription.created` arriving *before* `checkout.session.completed` — which Stripe does not guarantee against — is still enough to bind the church. Binding is order-independent because the identity travels with the object, not with the session.

Church resolution for subscription events, in order: `subscription.metadata.church_id` → `stripe_subscription_id` lookup → `stripe_customer_id` lookup → unmatched.

The success page is decorative. It renders a fixed pt-BR sentence, reads nothing, takes no id from the query string, and reveals no church. **The webhook does the work.** Trusting the redirect is the classic way to end up with a church that paid and never activated because the pastor closed the tab.

### Linking a church that subscribed outside the flow

**Vincular cliente do Stripe** exists for the church whose subscription Rafael created directly in the dashboard. Taking only a `cus_…` and writing only `stripe_customer_id` produces a church that no webhook will ever bind — the `created` event already fired and was recorded `unmatched` before the link existed — and that reconciliation would never revisit if reconciliation walked only churches with a `stripe_subscription_id`. That is the exact hole the feature exists to close, dug by the feature itself.

So the bind action does not write a bare customer id. It:

1. Calls `subscriptions.list({ customer, status: 'all', limit: 2 })`.
2. **Exactly one** → writes `stripe_customer_id` *and* `stripe_subscription_id` in one statement, then runs a normal apply. The church is bound, status-driven and drift-checked from that moment.
3. **Zero** → refuses with `Este cliente não tem nenhuma assinatura no Stripe. Crie a assinatura primeiro.` Nothing is written.
4. **Two or more** → refuses with `Este cliente tem mais de uma assinatura. Informe o ID da assinatura (sub_…) diretamente.` and the form reveals a second field taking a `sub_…`.

And, belt and braces, **reconciliation's candidate set is `stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL`.** A customer-only church resolves its subscription the same way the bind action does and is then bound. The structural guarantee does not depend on one action having been written correctly.

## Event → status mapping

Handled event types (the endpoint is configured in the Stripe dashboard to send only these):

| Event | Effect |
|---|---|
| `checkout.session.completed` | Bind `stripe_customer_id` / `stripe_subscription_id` if not already bound. No status change. |
| `customer.subscription.created` | Bind, then apply state. |
| `customer.subscription.updated` | Apply state. |
| `customer.subscription.deleted` | Apply state (`canceled` → suspended). |
| `charge.dispute.created` | Resolve to a church, record only. Visible in `/owner`. Outcome `recorded`. |
| `charge.refunded` | Resolve to a church, record only. Visible in `/owner`. Outcome `recorded`. |
| anything else | Recorded as `ignored`, 200. Its presence is itself a signal that the dashboard configuration drifted. |

"Apply state" means: re-fetch the subscription, then map its status through the one pure function.

### `mapStripeStatus` returns three outcomes, not two

The tables below require three distinguishable results, and `ChurchStatus | null` can only express two. `incomplete` is a *known* status we deliberately do nothing about — the event was understood and handled, outcome `applied`. An unrecognised string is *not* understood — outcome `ignored`, and its appearance is a signal that Stripe added a status we have never seen. Both would return `null`, so the handler could not produce the outcome the testing section asserts. The return type is a discriminated union:

```ts
export type StatusMapping =
  | { kind: 'map'; status: ChurchStatus }  // write it
  | { kind: 'hold' }                       // known, deliberately no status change → outcome 'applied'
  | { kind: 'unknown' };                   // never seen → no status change → outcome 'ignored'
```

`hold` and `unknown` both pass `null` into the apply statement's `$mapped` parameter — the *database* behaviour is identical by design — and they differ only in the outcome recorded on `stripe_event`. That is the whole point: the same safe write, two different things to tell a human.

| `subscription.status` | mapping | `church.status` | Grace |
|---|---|---|---|
| `trialing` | `map` | `active` | cleared |
| `active` | `map` | `active` | cleared |
| `past_due` | `map` | `past_due` | `COALESCE(grace_until, now + GRACE_PERIOD_MS)` |
| `unpaid` | `map` | `suspended` | cleared |
| `canceled` | `map` | `suspended` | cleared |
| `paused` | `map` | `suspended` | cleared |
| `incomplete` | `hold` | **unchanged** | unchanged |
| `incomplete_expired` | `hold` | **unchanged** | unchanged |
| unknown string | `unknown` | **unchanged**, event recorded as `ignored` | unchanged |

`incomplete` means the very first payment never succeeded — the church was never live on this subscription. Writing `suspended` there would take a church that Rafael is still onboarding off the air because a pastor's first card attempt was declined. An unknown status holds for the same reason: a Stripe status we have never seen must not silence a paying church.

`stripe_subscription_status`, `stripe_current_period_end`, `stripe_cancel_at`, `stripe_synced_at` and `stripe_sync_attempted_at` are written on **every** apply, including the ones that leave `status` alone and including overridden churches. That is what makes drift visible instead of invisible, and it is enforced by the shape of the statement rather than by remembering.

`cancel_at_period_end: true` deliberately changes nothing but `stripe_cancel_at`. They have paid through the period; they keep the bot until `deleted` arrives.

### Charge events resolve differently, and never through `apply`

A dispute or a refund is not a subscription state, so it must not go anywhere near the apply statement — there is no `sub_…` in it to re-fetch and nothing about the church's status that should move. It also cannot use the subscription resolution chain, because neither payload contains `metadata.church_id`.

The two payloads are different shapes and need different first steps:

- **`charge.refunded`** carries a **Charge**. Read `charge.customer` directly.
- **`charge.dispute.created`** carries a **Dispute**, which has `charge` and `payment_intent` but **no `customer` field**. Retrieve the charge named by `dispute.charge`, then read its `customer`.

From there both are the same:

`customer` → `stripe_customer_id` lookup → church. If `customer` is null (a charge created outside a subscription), fall back to `charge.invoice` → retrieve the invoice → its `customer` and `subscription`. If that is also null, or the customer matches no church row, the event is `unmatched` and lands in the repair queue with whatever ids were resolvable.

On success the row is written with `church_id`, `stripe_customer_id`, `stripe_object_id` (the `ch_…` or `dp_…`) and outcome `recorded`. The church row is not touched — not even `stripe_synced_at`, because nothing about the subscription was confirmed. This is what makes `charge.dispute.created` show up in the church's **Últimos eventos** list, which is where the `/owner` section promises it will be.

The precise field names on the Dispute and Charge objects are on the unverifiable list — the shape claim above is from the API reference, not from a call we have made.

## The webhook endpoint

`POST /api/stripe/webhook`.

1. **Read the raw body** with `request.text()` before any parsing. Stripe's signature is over the exact bytes.
2. **Verify** with `stripe.webhooks.constructEvent(raw, header, STRIPE_WEBHOOK_SECRET)`. On failure: **400, and nothing is written.** An unverified body must never create a database row — the same discipline as `src/app/api/whatsapp/webhook/route.ts:66-73`, where nothing is acted on before the HMAC check.
3. **Claim** — `INSERT INTO stripe_event (id, type, …) VALUES (…) ON CONFLICT (id) DO NOTHING RETURNING id`.
   - Insert succeeded → this delivery owns the work.
   - Conflict and the existing row has `processed_at IS NOT NULL` → 200 immediately, no work.
   - Conflict and `processed_at IS NULL` → **process it again.** A previous attempt claimed it and did not finish.
4. **Apply**, then `UPDATE stripe_event SET outcome, church_id, stripe_customer_id, stripe_subscription_id, processed_at = now(), attempts = attempts + 1 WHERE id = $1`.
5. **Answer:** 200 for applied, recorded, ignored, and unmatched. 500 for a transient failure — a Stripe API timeout, a database error — with the row left `outcome = 'failed'`, `processed_at` null, so both Stripe's retry and the next reconciliation pass will pick it up.

### No transactions

`db.transaction` does not exist on the neon-http driver. Three consequences, each handled by construction rather than by hope.

**Claim-then-crash.** The window between the claim insert and the `processed_at` write is exactly where an atomic system would use a transaction. Instead the claim is deliberately *weak*: `processed_at IS NULL` means "unproven", and an unproven event is re-processed rather than skipped. Re-processing is safe because applying a fetched state is idempotent — the second run computes the same status from the same subscription and writes the same row. The cost of the design is that a duplicate delivery of an in-flight event does the work twice; the benefit is that no event is ever silently dropped. Losing a `past_due` transition is worse than doing one redundant `UPDATE`.

**Grace-period drift.** `grace_until = now + 7 days` is the one genuinely non-idempotent write in the subsystem: applied twice, it moves the deadline. Two `past_due` events a day apart would silently hand the church eight days instead of seven. Handled in SQL, inside the same single statement as everything else.

**Binding two ids.** `stripe_customer_id` and `stripe_subscription_id` are written in the same single `UPDATE` as the status. They cannot half-commit. If a unique index rejects the write because another church already holds that `cus_…`, **the entire statement aborts and nothing lands** — verified below — the event is recorded `failed` with the constraint name, and it surfaces in the repair queue: the same story as the `church_phone_number_id_uq` handling at `src/app/owner/(protected)/[churchId]/actions.ts:38-42`.

### The apply statement

Everything above depends on one claim: that the whole rule — bind, status, grace, mirrors, override — fits in a single statement, because one statement is the only atomicity neon-http gives us.

An earlier draft expressed the override as a `WHERE` predicate:

```sql
-- WRONG. Kept here because the reason it is wrong is the interesting part.
UPDATE church SET status = 'past_due', grace_until = COALESCE(grace_until, $deadline), …
 WHERE id = $1 AND billing_override = false
```

That statement matches **zero rows** for an overridden church. So `stripe_synced_at` freezes at the moment the override was switched on, `/owner` shows `⚠️ Sem confirmação do Stripe há mais de 2 dias` on that church forever, and the drift report for overridden churches — the one thing that makes an override *safe*, because it tells Rafael what he is overriding — is unbuildable, since the columns it compares are never refreshed. The obvious repair, a second unconditional `UPDATE` for the mirror columns, reintroduces precisely the two-write non-atomicity this section exists to design away.

The override is not a row filter. It is a per-column rule. So it belongs in `SET`, as a `CASE`:

```sql
UPDATE church AS c
   SET stripe_customer_id     = $customer,
       stripe_subscription_id = $subscription,
       status = CASE
         WHEN c.billing_override            THEN c.status
         WHEN $mapped::church_status IS NULL THEN c.status
         ELSE $mapped::church_status
       END,
       grace_until = CASE
         WHEN c.billing_override            THEN c.grace_until
         WHEN $mapped::church_status IS NULL THEN c.grace_until
         WHEN $mapped::church_status = 'past_due'
           THEN COALESCE(c.grace_until, $deadline::timestamptz)
         ELSE NULL
       END,
       stripe_subscription_status = $raw,
       stripe_current_period_end  = $periodEnd::timestamptz,
       stripe_cancel_at           = $cancelAt::timestamptz,
       stripe_synced_at           = now(),
       stripe_sync_attempted_at   = now()
  FROM church AS prev
 WHERE c.id = $churchId AND prev.id = c.id
RETURNING prev.status      AS previous_status,
          c.status         AS new_status,
          prev.grace_until AS previous_grace_until,
          c.billing_override
```

Four things this buys, each of which was checked against a real Postgres (PGlite, the same engine the test suite runs) rather than assumed:

- **The override freezes exactly two columns.** An overridden church mapped to `suspended` keeps `status = 'active'` and `grace_until` untouched, while `stripe_subscription_status` becomes `'unpaid'` and `stripe_synced_at` advances. The staleness warning never fires spuriously and the drift report has fresh data to compare.
- **`$mapped IS NULL` covers `hold` and `unknown` in the same arm.** `incomplete` on a `past_due` church leaves both `status` and `grace_until` exactly as they were.
- **`COALESCE` still pins the deadline.** `past_due` applied twice leaves `grace_until` on its original value; a recovery to `active` clears it; a *new* delinquency after that recovery starts a fresh seven days. `setChurchStatus` already clears `grace_until` when moving to `active` or `suspended` (`src/lib/repo/platform.ts:95-96`), so the manual path and this one agree.
- **The self-join yields pre-update values in `RETURNING`.** `FROM church AS prev` is a self-join evaluated against the statement's snapshot, so `prev.status` is the value *before* this statement wrote — including on a multi-row update. That is the drift report, produced by the write itself, with no separate read to go stale between them. Zero rows returned means the church id no longer exists, which is itself a recordable outcome rather than a silent no-op.

**Two implementation notes that are not stylistic.**

`::church_status` on `$mapped` is **required, not decorative**. Postgres can infer a bare `$n` from an enum comparison arm, but `WHERE $n IS NULL` gives it nothing to infer from: without the cast the statement fails to prepare with `could not determine data type of parameter $2`. This was reproduced, not guessed. Every `$mapped` occurrence carries the cast.

The statement is expressed with Drizzle's `sql` template, not the query builder. A `CASE` referencing the row's own pre-update columns is not something `.set({})` can express, and splitting it to make the builder happy is the exact mistake this section is about.

## Reconciliation

Stripe is the source of truth for the subscription. The database is the source of truth for what the product does. Reconciliation is the process that makes the second agree with the first.

### Resumability is an ordering property, not a hope

The previous draft claimed resumability from the fact that each church is independent: "a crash halfway through leaves a partially reconciled set, which is a *correct* state, and the next run finishes the job." The first half is true. The second half is false, and the difference is the whole design.

With no ordering and no cap, the next run starts from the same unordered head and does the same work in the same order until it hits the same wall. At two hundred churches, one Stripe retrieve each, a Vercel function that times out around church 120 means churches 120–200 are **never reconciled on any run, ever** — and those are precisely the churches a missed webhook left wrong. Independence gives you *safety* on a crash. It does not give you *progress*.

Progress needs three things:

**An ordering key that always advances.** `ORDER BY stripe_sync_attempted_at ASC NULLS FIRST, id ASC`. Never-attempted churches come first, then the longest-neglected. Crucially, `stripe_sync_attempted_at` is written **before** the Stripe call, in its own one-line statement:

```sql
UPDATE church SET stripe_sync_attempted_at = now() WHERE id = $1
```

This is the one place in the subsystem with two statements per unit of work, and it is deliberate: this statement carries **no invariant**. Losing it to a crash means the church is retried sooner than necessary, which is harmless — the apply is idempotent. Ordering it before the Stripe call is what guarantees forward progress: a church whose retrieve throws every single time still has its cursor advanced, so it occupies one slot in one run instead of blocking the head of the queue permanently. Marking the attempt only on success would rebuild exactly the starvation the ordering exists to prevent.

Note the interlock with the apply statement: this only works because the apply lands mirror columns on **every** church including overridden ones. Under the old `WHERE billing_override = false` form, an overridden church would never advance its cursor and would sort to the front of every run forever, starving everyone behind it. The fix to the first Critical finding is a precondition for the fix to the second.

**An explicit per-run cap.** `RECONCILE_BATCH` churches per invocation. It is a safety valve, not a business number, and it lives next to the route rather than in the Stripe dashboard. A run that hits the cap says so in its report and in `/owner`, so "we only got through part of the list" is visible rather than inferred.

**A declared duration budget.** `export const maxDuration = 60` on `src/app/api/stripe/reconcile/route.ts`. The cap and the budget are chosen together: one Stripe retrieve plus one update per church, with the cap set well under what the budget can hold. The CLI runs uncapped, because it is not a lambda and the whole reason it exists is to be the tool for when the app is the suspect.

At a church count where a daily run at the cap no longer covers the list, the cron frequency has to rise. That is a number to revisit against a real deployment, and it is on the unverifiable list rather than asserted here.

### What a run does

`reconcileChurches()` selects the ordered, capped page of churches where `stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL` and, for each one, inside its own `try`:

1. Marks the attempt.
2. Resolves the subscription — directly by `stripe_subscription_id`, or via `subscriptions.list({ customer })` for a customer-only church.
3. Calls the **same** `apply` the webhook calls. There is one implementation of the mapping rule; a reconciler with its own copy is a second rule that will diverge.
4. Reads `previous_status` and `new_status` out of the statement's own `RETURNING` — that difference is the drift report.

A throw is caught per church, recorded, and the walk continues. One church that cannot be retrieved must not end the run for the rest of the page.

It then reports, without changing anything:

- churches with **neither** Stripe id (never subscribed, or subscribed outside the system),
- customer-only churches whose customer has zero or multiple subscriptions,
- Stripe subscriptions whose `metadata.church_id` matches no church row (orphans on Stripe's side),
- `stripe_event` rows still `received` or `failed`,
- whether the run hit the cap, and how many churches remain behind the cursor.

**Overridden churches are read and mirrored, but their status is not written.** `stripe_subscription_status`, `stripe_synced_at` and the period fields update; `status` and `grace_until` do not. The drift report lists them separately, because for an overridden church drift is the intended state and reporting it as an error would train Rafael to ignore the report. This section is only true because of the `CASE`.

Three entry points, one implementation: a daily Vercel Cron hitting `/api/stripe/reconcile` behind `CRON_SECRET`, a **Reconciliar agora** button in `/owner`, and `npm run billing:reconcile` for when the app itself is the suspect.

The multi-church spec argued against cron because "there is no scheduler to fail silently." That argument still holds and is why grace expiry remains computed on read. This cron is not load-bearing: if it never runs once, the system is exactly as correct as the webhooks left it. And its silence is not silent — `/owner` shows the age of `stripe_synced_at` per church and warns past two days.

## The owner console

A new **Assinatura** card on `/owner/[churchId]`, above the existing WhatsApp credentials card.

**Not yet subscribed** (`stripe_customer_id` is null): a **Gerar link de assinatura** button, and after generating, the URL with a copy control and the expiry timestamp Stripe returned. Also a **Vincular cliente do Stripe** field taking a `cus_…`, which resolves the subscription as described above and refuses rather than half-linking.

**Subscribed:** the raw Stripe status in Portuguese, the mapped `church.status`, next-charge date, scheduled-cancellation date if any, last-sync age, a deep link to the customer in the Stripe dashboard, a **Reconciliar agora** button, and the last ten `stripe_event` rows for this church — which is where a `charge.dispute.created` becomes visible without a dedicated column for it. That list is served by the `(church_id, received_at DESC)` index.

**Override:** a toggle with a required reason field. While on, a persistent badge names the date and the reason, and the existing `StatusControls` gains a warning that a manual status change *without* the override will be overwritten by the next Stripe event.

Two things about the override that the copy must not blur:

- **It freezes; it does not activate.** The flag pins whatever status is stored at the moment it is switched on. Turned on for a church stored `suspended`, the church stays suspended and Stripe can no longer rescue it. The previous draft's label — `Manter ativa independentemente do Stripe` — promised the opposite of the behaviour, and the copy below is rewritten. The UI states the ordering explicitly: set the status you want first, then freeze it.
- **It does not constrain Rafael.** `setChurchStatus` (`src/lib/repo/platform.ts:82-97`) does not read `billing_override` and is not changed to. Manual control is the escape hatch; an escape hatch that can lock its own operator out is a worse failure than the one it prevents. The rule is precisely: *Stripe events and reconciliation* cannot write `status` or `grace_until` on an overridden church. `StatusControls` always can.

**Unmatched events** get their own section on `/owner`: type, the resolved `cus_…` when there is one, date, and a control to bind it to a church. This is the repair path for the "event names a church that does not exist" case, and without it those events are a log line nobody reads. It reads the dedicated `stripe_customer_id` column, which is why that column exists separately from `stripe_object_id`: a subscription event's object id is a `sub_…`, and printing that under a **cliente** label would give Rafael an id he cannot bind with.

## What the church sees

Deliberately close to nothing.

The two existing banners in `src/app/admin/(protected)/layout.tsx:32-42` already cover the states. The `past_due` banner gains the actual deadline, which the layout already has in hand.

`/admin/configuracoes` gains a small read-only **Assinatura** block: situation, next-charge or trial-end date, and one button — **Atualizar forma de pagamento** — which opens a Stripe Billing Portal session for *this church's own* customer. No amounts, no plan selection, no invoice list; the portal shows invoices better than we would, and re-implementing it means mirroring money into our database.

Three subtleties:

- **The portal action cannot use `requireWritableSession`.** That guard refuses a suspended church (`src/lib/auth/writable.ts:29-31`), and a suspended church paying its bill is precisely the outcome we want. The action uses `requireReadableSession` and is documented as the one deliberate exception. The `churchId` comes from the session; the customer id is read from that church's own row via `getChurchById` and is **never** an action parameter — so there is no input a caller could substitute. The action imports `stripe-portal.ts`, which cannot do anything but open a portal for the id handed to it, and the privilege suite's bare-specifier rule stops it importing the SDK directly.
- **The portal configuration must not offer cancellation.** Otherwise this button is a self-service off switch.
- **The block adds no new page.** It renders inside `src/app/admin/(protected)/configuracoes/page.tsx`, which already imports `requireReadableSession` and calls it on line 9. The `admin read guard` test therefore passes unchanged and no page joins `NO_CHURCH_DATA`. Had this been a new `/admin/assinatura` route, it would have needed the guard on day one; it is worth writing down that the choice not to add a route is what avoids that.

There is no relationship between this subsystem and the **Ofertas** menu item. Ofertas is what a member gives their church; assinatura is what a church pays the vendor. They never appear on the same screen and never share vocabulary.

## Failure modes

| Failure | What happens |
|---|---|
| **Expired card** | Stripe's dunning runs (dashboard-configured). `subscription.status → past_due` → we write `past_due` + a 7-day deadline → banner with the date. A Smart Retry that succeeds sends `active` → we clear the deadline. If dunning ends in `canceled` or `unpaid`, both map to `suspended`. The mapping is identical whichever ending Rafael configures. |
| **Grace expires** | Nothing runs. `effectiveStatus` reads `past_due` past `grace_until` as `suspended` (`src/lib/church-status.ts:18-20`), the webhook stops sending, the panel goes read-only. Unchanged by this work. |
| **Dispute** | Charge retrieved, church resolved via `charge.customer`, row recorded, listed in `/owner`, no status change and no `stripe_synced_at` write. |
| **Refund** | Church resolved via `charge.customer` on the payload itself, recorded, listed, no status change. A refund does not cancel a subscription; if Rafael wants them off he cancels in Stripe. |
| **Dispute or refund on a charge with no customer** | Falls back to `charge.invoice`; if that yields nothing, `unmatched` + 200 + repair queue. |
| **Cancelled in the Stripe dashboard** | `updated` with `cancel_at_period_end` → we store the date and change nothing. `deleted` at period end → `suspended`. Cancelled immediately → `deleted` at once → `suspended` at once. |
| **Church pays after suspension, subscription still exists** | An invoice is paid → `active` → the bot wakes up for **new** messages. Conversations that went cold during suspension **cannot be answered**: Meta's 24-hour service window is measured from `contact.lastInboundAt` (`src/lib/reply-window.ts:6-9`) and has closed. Those threads sit in the Caixa de Entrada until the member writes again. This is a real product consequence of suspension and it should be said out loud to a church before it is suspended, not discovered afterwards. |
| **Church pays after suspension, subscription deleted** | A paid invoice does not resurrect a deleted subscription. Rafael generates a new Checkout link; passing the existing `customer` keeps one billing history. |
| **Event names an unknown church** | Recorded `unmatched`, **200** — three days of retries cannot create a church row. Appears in the `/owner` repair queue with whatever ids resolved. |
| **Forged or unsigned payload** | 400. No row written. |
| **Duplicate delivery, already processed** | 200, no work. |
| **Duplicate delivery, claim unproven** | Re-processed. Safe by construction. |
| **Crash between claim and apply** | Row stays `processed_at IS NULL`. Stripe's retry re-processes it; if Stripe has given up, reconciliation repairs the church anyway, because reconciliation works from subscriptions rather than from events. |
| **Stripe API down during the re-fetch** | 500 → Stripe retries with backoff. Row `failed`. Reconciliation is the backstop. |
| **Stripe API down for one church during reconciliation** | Caught per church. Attempt already marked, so the cursor advances; the run continues to the next church; the failure is in the report. |
| **Reconciliation run exceeds `maxDuration`** | Every church it reached is correct and has an advanced cursor. The next run starts at the frontier, not at the head. This is the finding that ordering exists to fix. |
| **Reconciliation run hits the batch cap** | Reported as a partial run in `/owner` and in the route's response, with the number of churches still behind the cursor. |
| **Webhook endpoint disabled by Stripe after sustained failures** | The only detector is `stripe_synced_at` age in `/owner`, which is exactly why that field exists — and why the override must not freeze it. |
| **Two lambdas race on the same church** | Both re-fetch the same current state and write the same values. The one non-idempotent write is handled by `COALESCE` inside the statement. |
| **`cus_…` already bound to another church** | Unique-index violation aborts the entire apply statement — no partial bind, no status write — event `failed` with the constraint name → repair queue → Rafael clears the stale link first. |
| **Church overridden while Stripe moves it to `past_due`** | `status` and `grace_until` frozen; `stripe_subscription_status` becomes `past_due` and `stripe_synced_at` advances; `/owner` shows the divergence in the drift list, not as a staleness warning. |
| **Bind attempted on a customer with no subscription** | Refused, nothing written, pt-BR message. The church is not left in the un-reconcilable half-bound state. |
| **`STRIPE_PRICE_ID` unset or pointing at a deleted price** | The Checkout action fails with a named pt-BR error rather than a stack trace. No church state changes. |
| **Price changed in the dashboard** | Existing subscriptions keep the old price; Stripe does not migrate them. Updating the env var only affects churches subscribed after the change. This surprises people and is worth writing on the wall. |

## User-facing strings

Every string below is Brazilian Portuguese and appears verbatim in the implementation. `{data}` is `dd/mm/aaaa`, `{hora}` is `hh:mm`, `{n}` an integer, `{motivo}` free text.

### Church panel — banners (`src/app/admin/(protected)/layout.tsx`)

Unchanged, suspended:

> `Assinatura suspensa — o painel está somente leitura e o bot não está respondendo. Entre em contato com o suporte para reativar.`

Amended, `past_due` — the deadline is added because the layout already loads `graceUntil`:

> `Pagamento pendente. Regularize até {data} para não interromper o atendimento aos membros.`

When `graceUntil` is null, the existing sentence stands unchanged:

> `Pagamento pendente. Regularize para não interromper o atendimento aos membros.`

### Church panel — Configurações → Assinatura

- `Assinatura`
- `Situação: Ativa`
- `Situação: Pagamento pendente`
- `Situação: Suspensa`
- `Próxima cobrança em {data}.`
- `Período de teste até {data}.`
- `Atualizar forma de pagamento`
- `Você será levado a uma página segura do Stripe. Nós nunca vemos os dados do seu cartão.`
- `Esta igreja ainda não tem assinatura. Entre em contato com o suporte.`
- `Não foi possível abrir a página de pagamento. Tente novamente em instantes.`

### Public return pages

`/assinatura/obrigado`:

- `Pagamento confirmado 🙏`
- `Obrigado! A assinatura da sua igreja foi registrada. Você já pode entrar no painel.`
- `Entrar no painel`

`/assinatura/cancelado`:

- `Assinatura não concluída`
- `Nada foi cobrado. Se você fechou a página por engano, peça um novo link ao suporte.`

Neither page reads a query parameter, names a church, or shows an id.

### Owner console — Assinatura card

- `Assinatura`
- `Sem assinatura no Stripe.`
- `Gerar link de assinatura`
- `Envie este link para a igreja. Ele expira em {data} às {hora}.`
- `Copiar link`
- `Não foi possível gerar o link. Verifique se a chave e o preço do Stripe estão configurados.`
- `Situação no Stripe: {situação}`
- Status labels: `Em teste` · `Ativa` · `Pagamento em atraso` · `Não paga` · `Cancelada` · `Incompleta` · `Incompleta (expirada)` · `Pausada` · `Desconhecida`
- `Próxima cobrança em {data}.`
- `Cancelamento agendado para {data}.`
- `Última verificação com o Stripe: há {n} dia(s).`
- `Nunca verificada com o Stripe.`
- `⚠️ Sem confirmação do Stripe há mais de 2 dias. Verifique se o webhook está funcionando.`
- `Reconciliar agora`
- `Não foi possível falar com o Stripe. Tente novamente.`
- `Abrir cliente no Stripe`
- `Últimos eventos`
- `Nenhum evento ainda.`

### Owner console — vincular cliente

- `Vincular cliente do Stripe`
- `ID do cliente (cus_…)`
- `ID da assinatura (sub_…)`
- `Este cliente do Stripe já está vinculado a outra igreja. Desvincule-o lá primeiro.`
- `Este cliente não tem nenhuma assinatura no Stripe. Crie a assinatura primeiro.`
- `Este cliente tem mais de uma assinatura. Informe o ID da assinatura (sub_…) diretamente.`
- `Não foi possível consultar este cliente no Stripe. Tente novamente.`

### Owner console — reconciliação

- `Reconciliação concluída: {n} igreja(s) verificada(s).`
- `Reconciliação parcial: {n} igreja(s) verificada(s), {n} ainda na fila. A próxima execução continua de onde parou.`
- `{n} igreja(s) com diferença corrigida.`
- `{n} igreja(s) com situação congelada — diferença mantida de propósito.`
- `{n} igreja(s) sem assinatura no Stripe.`
- `{n} evento(s) ainda pendente(s).`

### Owner console — override (congelamento)

The label from the previous draft, `Manter ativa independentemente do Stripe`, is **removed**: the flag freezes the stored status, so on a suspended church that label promised the opposite of what happens.

- `Congelar a situação atual (ignorar o Stripe)`
- `Motivo (obrigatório)`
- `Informe o motivo do congelamento.`
- `Enquanto isso estiver ligado, nenhum evento do Stripe altera a situação desta igreja. A situação atual é mantida como está — para deixá-la ativa, defina a situação como Ativa antes de congelar.`
- `⚠️ Situação congelada manualmente desde {data} — {motivo}`
- `Descongelar`
- `A situação desta igreja está congelada. Você ainda pode alterá-la manualmente aqui; o Stripe é que não pode.`

### Owner console — StatusControls addition

- `Enquanto a situação não estiver congelada, uma alteração manual dura só até o próximo evento do Stripe, que a sobrescreve.`

### Owner console — unmatched events

- `Eventos sem igreja`
- `Nenhum evento pendente.`
- `{tipo} · cliente {cus_…} · {data}`
- `{tipo} · sem cliente identificado · {data}`
- `Vincular a uma igreja`

## Environment, dependencies and dashboard configuration

**A new dependency.** `stripe` is not in `package.json` today and must be added to `dependencies`. The client **pins `apiVersion` explicitly** at construction rather than accepting the SDK default. This document itself flags that event names and the location of `current_period_end` are API-version dependent — leaving the version to drift with an `npm update` would make those flags unactionable, because the version they were checked against would be unrecorded.

**A new script.** `"billing:reconcile": "tsx scripts/billing-reconcile.ts"` in `package.json`, alongside the existing `create-church` and friends. The `/owner` copy already refers to reconciliation; the CLI referred to in this document does not exist until this entry does.

New variables, added to `.env.example`:

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server-side API key. |
| `STRIPE_WEBHOOK_SECRET` | Endpoint signing secret. |
| `STRIPE_PRICE_ID` | A **pointer**. Amount, currency, interval and trial live on the Price object in the dashboard. |
| `APP_BASE_URL` | Absolute base for `success_url` / `cancel_url`. |
| `CRON_SECRET` | Vercel-injected; guards the reconcile route. |

**The `.env.example` header comment is already wrong and this change makes it worse.** Line 1 reads "the ONLY secret this app needs" while `SESSION_SECRET` and `BLOB_READ_WRITE_TOKEN` sit six and ten lines below it. The previous draft of this spec said that claim "stops being true", implying it is true now; it has been false since the session and blob work shipped. The correction is part of this change, framed as fixing an existing inaccuracy rather than introducing one.

Dashboard configuration that is part of "done", not optional afterwards:

1. A recurring BRL Price with the trial configured on it.
2. The webhook endpoint subscribed to exactly the six handled event types.
3. Dunning (Smart Retries and the end-of-dunning action) configured; either ending maps correctly.
4. A Billing Portal configuration with **payment-method update and invoice history enabled, cancellation disabled**.
5. `vercel.json` with the daily cron entry — the repo has no `vercel.json` today, so this creates one.

## Testing

Everything runs on PGlite and pure functions. Nothing ever touches live Stripe.

- **`mapStripeStatus`** — all eight documented Stripe statuses, plus an unknown string, plus the empty string. Assertions are on the *union tag*, not just the status: the six mapped ones return `{ kind: 'map' }`, `incomplete` and `incomplete_expired` return `{ kind: 'hold' }`, and anything else returns `{ kind: 'unknown' }`. A test that only checked "no status change" would pass with the old two-outcome type and miss the `applied` / `ignored` distinction entirely.
- **The apply statement, directly against PGlite** — this is the highest-value suite in the subsystem, because it is where the atomicity argument lives:
  - `past_due` on a clean church sets status and a fresh deadline;
  - `past_due` again leaves `grace_until` byte-identical;
  - `active` clears it; a later `past_due` starts a new seven days;
  - `$mapped = NULL` leaves `status` and `grace_until` untouched while mirrors advance;
  - **an overridden church keeps `status` and `grace_until` and still advances `stripe_subscription_status`, `stripe_synced_at` and `stripe_sync_attempted_at`** — the regression test for the finding that drove this revision;
  - `RETURNING` reports the pre-update `previous_status`, so the drift report is provably reading old values;
  - a bind onto a `cus_…` held by another church raises the unique-constraint error **and leaves every other column of the target row unchanged**, proving the statement aborts whole;
  - the statement fails to prepare if the `::church_status` cast is removed — worth one test so nobody "simplifies" it away.
- **Signature verification is real, not mocked.** Stripe's scheme is an HMAC over `"{timestamp}.{payload}"`, so tests can construct genuinely valid signatures from a known `STRIPE_WEBHOOK_SECRET`, exactly as `tests/webhook-suspension.test.ts` builds real Meta signatures. A tampered body and a stale timestamp must both 400.
- **Webhook route against PGlite** with the Stripe client stubbed at `src/lib/billing/stripe-client.ts` (one module to stub, which is the reason it exists): unknown church → `unmatched` + 200; duplicate processed → no second write; duplicate unproven → re-processed; overridden church → `status` untouched, `stripe_synced_at` updated; `incomplete` → nothing changes, outcome `applied`; unknown status string → nothing changes, outcome `ignored`.
- **Charge events** — `charge.refunded` with a `customer` resolves to the church and records `recorded` with no church-row write at all; `charge.dispute.created` retrieves the charge via the stub and resolves the same way; a charge with neither `customer` nor `invoice` lands `unmatched`; and the church's `status` and `stripe_synced_at` are asserted **unchanged** in every one of those cases.
- **Out-of-order delivery** — deliver `updated(active)` after `updated(past_due)` with the stub returning the *current* subscription, and assert the church ends up matching the stub rather than matching the last event body. This is the test that proves the re-fetch decision.
- **Reconciliation ordering and progress** — the load-bearing test for the second finding. Seed more churches than the cap; run once; assert the churches processed are exactly the oldest-attempted page and that every one of them has an advanced `stripe_sync_attempted_at`. Run again; assert the **second** page is processed and the first is not revisited. Make one church's retrieve throw on every call and assert it does not prevent the rest of its page from being processed, and does not appear at the head of the following run.
- **Reconciliation semantics** — drift repaired; override respected but mirrored; a customer-only church resolved and bound; a customer with zero subscriptions reported rather than half-bound.
- **Bind action** — one subscription binds both ids; zero and two-or-more refuse and write nothing.
- **Portal action isolation** — assert the action ignores any customer id present in its input and uses the session church's own, and that a suspended church can still open it.
- **Privilege boundary** — extended as described, and *watched failing* before it is trusted: one injected owner-only import and one injected bare `import Stripe from 'stripe'`, both from `src/app/api/whatsapp/webhook/route.ts`. Plus a test that `walk()` now returns the owner-only files themselves, so the directory exemption cannot silently shrink the scan.
- **Tenant isolation** — one added assertion: deleting a church leaves its `stripe_event` rows present with a null `church_id`, so the deliberate `ON DELETE SET NULL` exception is tested rather than assumed.
- **`admin read guard`** — no change needed and none made; `configuracoes/page.tsx` already imports and calls `requireReadableSession` (`src/app/admin/(protected)/configuracoes/page.tsx:1,9`) and the billing block is added inside it. Stated here so the next reader knows it was checked rather than overlooked.

## PIX and boleto

Stripe supports both in Brazil, and neither fits this design.

PIX is a push payment: there is no stored credential to charge, so every cycle needs the payer to act. Boleto is the same shape with a longer settlement. Recurring collection with either means moving the subscription to `collection_method: 'send_invoice'`, where Stripe emails a hosted invoice each period and waits. That removes Smart Retries and automatic recovery entirely, which would promote the 7-day grace period from a backstop to the primary mechanism.

One useful property: because status is mapped from `subscription.status`, and that field means the same thing under both collection methods, **switching to invoice collection later requires no change to the mapping, the webhook, or the reconciler** — only to how the subscription is created. If Brazilian churches turn out to refuse cards, which is plausible, that is the revisit, and it is a small one.

Not designed around, per the brief.

## Out of scope

- Self-serve signup and a public pricing page.
- Proration, multiple tiers, plan changes, usage-based billing, coupons.
- PIX and boleto collection.
- Invoice rendering, receipts, or payment history in our panels — the Stripe Billing Portal owns that.
- Dunning emails from us. Stripe sends them, configured in the dashboard.
- Multi-currency.
- **Nota fiscal.** Stripe does not issue Brazilian tax documents. Selling a recurring service to churches creates an invoicing obligation that this subsystem does not touch and cannot solve. It needs an accountant, not a migration — but it is a launch blocker for real revenue and belongs on the checklist, not in a footnote.

## What cannot be verified here

The honest list, in the spirit of the existing roadmap's "what is written but has never executed".

**No live Stripe account exists**, so every one of these is a claim to be checked against the real API on first run, not a fact:

- The exact location of `current_period_end` — recent Stripe API versions moved it from the subscription to the subscription item. `stripe_current_period_end` is display-only precisely so that getting this wrong is cosmetic.
- How trial days are read off a Price object, and whether the dashboard exposes them on the Price at all. If it does not, the trial length has to move to a named env var, which is still not a hardcoded number but is a worse home for it.
- **That the Dispute object carries `charge` but no `customer`, and that the Charge object carries `customer` and `invoice`.** The charge-resolution path is built on that shape. If a Dispute does expose a customer, the extra retrieve is wasted but harmless; if a Charge does not, the resolution needs the invoice hop on every event rather than as a fallback.
- Whether `subscriptions.list({ customer, status: 'all' })` returns cancelled subscriptions, which decides what "exactly one" means for the bind action on a church that has re-subscribed.
- Checkout Session expiry semantics — the copy now renders `session.expires_at` rather than asserting a duration, so this is a display question and no longer a correctness one.
- The Billing Portal configuration model and whether cancellation can in fact be disabled.
- Stripe's webhook timeout and retry schedule.
- Whether Stripe Brazil's onboarding for BRL settlement requires a CNPJ, and what that implies for Rafael's entity.
- Whether the event type names are stable for the API version the SDK pins.

**No live database and no live deployment exist.** Nothing in this repository has ever executed against Neon; migration `0004` will be applied to PGlite in tests and to a real server for the first time in production. Vercel Cron has never run for this project, `CRON_SECRET` has never been injected, and the reconciliation route has never been called by anything but a test. Two consequences that are genuinely unknown:

- The real wall-clock cost of one Stripe retrieve from a Vercel function in the deployed region, which is what actually sets `RECONCILE_BATCH` against `maxDuration`. The numbers in this document are a starting point to be measured, not a result.
- The church count at which a daily cron at the cap stops covering the list, and therefore when the cron frequency must rise.
- The behaviour of the neon-http driver under concurrent lambdas.

**What is testable, and was tested while writing this document.** The single-statement atomicity the whole no-transaction design rests on is a property of Postgres, and PGlite is Postgres. The apply statement in this spec — the `CASE` override, the `COALESCE` grace pin, the `::church_status` cast requirement, the `FROM church AS prev` self-join returning pre-update values on a multi-row update, and the whole-statement abort on a unique-index violation — was executed against PGlite before being written down here, and the cast requirement in particular was found by the statement failing, not by reading documentation. The signature check, the idempotency claim, the status mapping, the reconciliation cursor's progress guarantee, and the privilege boundary are all exercisable the same way with a stubbed Stripe client. Those are where the bugs that cost money live, and there is no excuse for shipping them unverified.

## Prerequisite

This sits behind stage 7 of the roadmap. **A church should be live, connected to Meta, and answering real members before its payment can fail.** Billing that automates the suspension of a bot nobody has ever spoken to automates nothing.

## Revisions

**Revision 2 — 2026-08-07.** Adversarial review returned "Needs revision" with two Critical and six required findings. Every finding is addressed below; two are partly refuted with evidence.

| Finding | Disposition |
|---|---|
| **C1 · Override predicate contradicts override behaviour** | **Fixed, structurally.** The `WHERE billing_override = false` form matched zero rows for an overridden church, freezing `stripe_synced_at` and making the promised drift report unbuildable. Replaced with the reviewer's proposed `CASE` form, extended to cover the `hold`/`unknown` no-op arm and the id binding, so the *entire* rule is still one statement. **The form was verified against real Postgres (PGlite) before adoption, not assumed** — including that it freezes exactly two columns, that `COALESCE` still pins the deadline, that a unique-index violation aborts the whole statement leaving nothing partially written, and that `FROM church AS prev` yields pre-update values in `RETURNING` even on a multi-row update, which is what makes the drift report a by-product of the write instead of a second read. One correction to the reviewer's sketch: **the `::church_status` cast is mandatory, not stylistic** — without it the statement fails to prepare with `could not determine data type of parameter $2`, reproduced. |
| **C2 · Reconciliation not resumable** | **Fixed.** Added `ORDER BY stripe_sync_attempted_at ASC NULLS FIRST, id ASC`, an explicit `RECONCILE_BATCH` cap, `export const maxDuration = 60`, per-church `try`/`catch`, and partial-run reporting. This required a **seventh column**, `stripe_sync_attempted_at`, separate from `stripe_synced_at`: the cursor must advance on failure or a permanently broken church starves the queue head forever, while the staleness warning must *not* advance on failure or a broken church looks healthy. The attempt marker is written **before** the Stripe call and is the one deliberate two-statement path in the subsystem — justified because it carries no invariant. Noted the interlock: this fix only works because C1's fix lands mirror columns on overridden churches. |
| **3 · Charge events have no resolution path** | **Fixed, and the reviewer's sketch corrected.** The review proposed `charge → charge.customer`. That is right for `charge.refunded`, whose payload *is* a Charge — but `charge.dispute.created` carries a **Dispute**, which has `charge` and `payment_intent` and no `customer` field, so it needs a charge retrieve first. Both paths, the `charge.invoice` fallback, the null case, and a new `recorded` outcome distinct from `applied` are now specified. The object-shape claim is added to the unverifiable list. |
| **4 · `mapStripeStatus` return type** | **Fixed.** Now a three-arm discriminated union (`map` / `hold` / `unknown`). Both no-op arms pass `NULL` to the same SQL and differ only in the recorded outcome. |
| **5 · Customer-only bind is invisible to reconciliation** | **Fixed twice over.** The bind action resolves the subscription and writes both ids or refuses (zero / multiple cases each get pt-BR copy), *and* reconciliation's candidate set widens to `subscription_id IS NOT NULL OR customer_id IS NOT NULL`, so the guarantee does not depend on the action being written correctly. |
| **6 · `stripe-client.ts` importable by anyone** | **Fixed, and extended.** Split into an owner-only general client and a church-safe `stripe-portal.ts`. But the review's fix is insufficient on its own: `resolveSpecifier` returns `null` for bare package specifiers (`tests/privilege-boundary.test.ts:56`), so church-facing code could `import Stripe from 'stripe'` and hold full capability while every assertion passed. Added a second rule restricting the raw `stripe` specifier to the owner zone plus the one church-safe module. Also fixed a latent hazard from the binding constraints: `walk()` skips `ALLOWED` (`:44`), so making `src/lib/billing-sync/` owner-only as a directory would make it invisible to *every* rule in the suite — the scan set and the exemption set are now separated. |
| **7 · `stripe_object_id` conflates customer and subscription** | **Fixed.** Three columns: `stripe_object_id` (audit, what the event was about), `stripe_customer_id` and `stripe_subscription_id` (resolution keys, what the UI and reconciler read). |
| **8 · Override label contradicts semantics** | **Fixed by changing the copy, not the semantics.** Freeze is the correct behaviour — forcing `active` would be a fourth status in disguise, which the constraints forbid. `Manter ativa independentemente do Stripe` is removed and replaced with `Congelar a situação atual (ignorar o Stripe)` plus explanatory copy stating the required ordering. Also resolved the ambiguity the review flagged: `setChurchStatus` deliberately does **not** consult the flag, so Rafael's manual control always wins; the rule is now stated as "Stripe events and reconciliation cannot write", never "nothing can write". |
| **9 · Missing dependency, unpinned `apiVersion`, missing script** | **Fixed.** `stripe` added to `dependencies`, `apiVersion` pinned explicitly with the reason, `"billing:reconcile"` script specified. |
| **10 · Hardcoded 24-hour expiry claim** | **Fixed.** Copy now renders `session.expires_at`: `Envie este link para a igreja. Ele expira em {data} às {hora}.` Checkout expiry moves from a correctness risk to a display detail. |
| **11 · `.env.example` "ONLY secret" line** | **Finding upheld; the previous draft was wrong and is corrected.** Verified: line 1 makes the claim, `SESSION_SECRET` and `BLOB_READ_WRITE_TOKEN` are below it. The claim is *already* false. The spec no longer says it "stops being true". |
| **12a · New billing block must satisfy `admin read guard`** | **Partly refuted, with evidence.** No new page is created. The block renders inside `src/app/admin/(protected)/configuracoes/page.tsx`, which already imports `requireReadableSession` on line 1 and calls it on line 9 — so the existing test passes unchanged and nothing joins `NO_CHURCH_DATA`. The spec now records that this was checked, and records that a separate `/admin/assinatura` route *would* have needed the guard, since the choice not to add a route is what avoids it. |
| **12b · Missing `stripe_event` indexes** | **Fixed.** `(church_id, received_at DESC)` and `(outcome)` added, each tied to the `/owner` query that needs it. |

**Not changed, and why.** The review's "Clean" section is accepted as-is: the re-fetch-don't-trust-the-payload decision, the weak-claim/re-process idempotency argument, the `ON DELETE SET NULL` exception, the single-event-family choice and the pt-BR string set all survive this revision untouched except where a finding above required the wording to move.

**Still genuinely undecidable without the owner or a live account.** `RECONCILE_BATCH` and the cron frequency cannot be chosen without measuring a real Stripe retrieve from a deployed function; the Dispute/Charge field shapes and `subscriptions.list` semantics for cancelled subscriptions need one real call each; and the four items the review already listed for the owner — trial-on-Price, card versus PIX acceptance, nota fiscal, and portal cancellation-disable — are unchanged by this revision.
