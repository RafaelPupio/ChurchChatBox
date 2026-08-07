# Secretária Virtual — Stripe Billing

**Design doc** · 2026-08-07 · Status: proposed

## Overview

Today a church's subscription lifecycle is a column somebody types into. `church.status` exists, `grace_until` exists, `effectiveStatus()` reads them correctly — and the only thing that ever writes them is Rafael clicking a button in `/owner`. This subsystem makes Stripe do the writing.

**The vendor provisions, Stripe bills.** Rafael creates each church from `/owner` exactly as he does now. Stripe's only job is to charge an already-provisioned church and drive its `status` automatically. There is no public signup, no public pricing page, and no checkout route on our domain.

### What "done" means

1. Rafael can turn a provisioned church into a paying subscriber without leaving `/owner` and without ever touching the church's card.
2. A failed payment moves the church to `past_due` with a real 7-day deadline, and a recovered payment moves it back to `active` — with no human involved on either edge.
3. The Stripe webhook rejects forged payloads, survives duplicate and out-of-order delivery, and never loses an event to a crash between "received" and "applied".
4. When a webhook is missed entirely, a reconciliation pass detects the drift and repairs it, and the fact that reconciliation itself has stopped running is visible in `/owner` rather than silent.
5. Rafael can keep any church running regardless of what Stripe thinks, with the reason recorded.
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
| Manual override | A boolean + required note on `church`, **not** a fourth status | The constraint is explicit: no parallel status model. Override is orthogonal to status — it says "nothing may overwrite this", not "the church is in a new state". |
| Reconciliation cadence | Daily Vercel Cron, plus a `/owner` button, plus a CLI | The multi-church spec rejected cron for *grace expiry*, and that stands — grace is still computed on read. This cron is a **repair** pass: if it never runs, the system is exactly as correct as the webhooks made it. Its own liveness is visible as `stripe_synced_at` age in `/owner`, so a dead scheduler shows up in the UI instead of failing silently. |
| Stripe API key | Env var, platform-wide | There is one Stripe account for all churches. It is a *vendor* credential, unlike the Meta credentials, which are per-church rows because each church has its own number. |
| Trial | Card collected up front even during a trial (`payment_method_collection: 'always'`) | A trial that ends with no card produces `incomplete`, a dark bot, and a confused pastor — after Rafael has already spent days on Meta verification. Fewer trial starts is the right trade for a sales-assisted product. |
| Dispute / refund | Recorded, surfaced, **no automatic status change** | Auto-suspending a church mid-conversation over a disputed charge is worse than the amount in dispute. If Rafael wants them off, he cancels in Stripe and the normal path handles it. |
| Billing Portal scope | Update payment method + view invoices only; **cancellation disabled** in the portal configuration | Otherwise a church cancels itself at 2am and the bot goes dark with no human in the loop. This is dashboard configuration, and it is a launch prerequisite, not a nicety. |
| Collection method | `charge_automatically` (card) | See the PIX/boleto note. Chosen because it is the only method with automatic recovery. |

## Architecture

### Schema changes

One new migration, `drizzle/0004_*.sql`, generated by `npm run db:generate`. Migrations `0000`–`0003` are never edited.

**`church` gains six columns:**

| Column | Type | Null | Purpose |
|---|---|---|---|
| `stripe_subscription_status` | `text` | yes | The raw Stripe status string, last seen. Deliberately **not** an enum: Stripe adds statuses (`paused` arrived after `unpaid`), and a new one must not require a migration before we can even display it. |
| `stripe_current_period_end` | `timestamptz` | yes | What `/owner` and the church panel show as "próxima cobrança". Display only — nothing branches on it. |
| `stripe_cancel_at` | `timestamptz` | yes | Set when the subscription is scheduled to cancel at period end. Display only; the church keeps working until `deleted` arrives. |
| `stripe_synced_at` | `timestamptz` | yes | When we last confirmed this church against Stripe, by webhook or reconciliation. Drives the staleness warning. |
| `billing_override` | `boolean NOT NULL DEFAULT false` | no | While true, no Stripe event or reconciliation may write `status` or `grace_until`. |
| `billing_override_note` | `text` | yes | Why. Required by the action that sets the flag; nullable in the schema because every existing row predates it. |

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
| `stripe_object_id` | `text` | The `sub_…` or `cus_…` the event was about, for the repair queue. |
| `outcome` | `stripe_event_outcome NOT NULL DEFAULT 'received'` | New pgEnum: `received` \| `applied` \| `ignored` \| `unmatched` \| `failed`. |
| `error` | `text` | Last failure message, for `failed`. |
| `attempts` | `integer NOT NULL DEFAULT 0` | Incremented on each processing attempt. |
| `received_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `processed_at` | `timestamptz` | **Null means the claim was made but the work is unproven.** The whole no-transaction story hangs on this column. |

Two deliberate omissions and one deliberate exception:

- **The event payload is not stored.** Stripe billing payloads carry the paying contact's email and name and the card's brand and last four digits. That is personal data of a church officer with no retention story attached, and it is retrievable from the Stripe dashboard when a human actually needs it. We store the shape of what happened, not the record of it.
- **No `amount` column.** Money lives in Stripe. Mirroring it here creates a second ledger that can disagree with the first.
- **`ON DELETE SET NULL`, not `CASCADE`.** Every other child table cascades, and the tenant-isolation suite asserts that deleting church A removes all of A. `stripe_event` is the exception on purpose: it holds no member data, it is the vendor's financial audit trail, and Rafael needs it *after* a church leaves. The migration must be accompanied by an explicit assertion in the isolation suite that this row survives and nulls out, so the exception is tested rather than discovered.

### Components, one responsibility each

| Module | Responsibility | May be imported by |
|---|---|---|
| `src/lib/billing/stripe-status.ts` | **Pure.** `mapStripeStatus(raw: string): ChurchStatus \| null`. No I/O, no dates, no database. Mirrors `church-status.ts`. | anyone |
| `src/lib/billing/stripe-client.ts` | The **only** module that talks to the Stripe API, exactly as `src/lib/whatsapp.ts` is the only module that talks to the Graph API. Lazy client construction so `next build` never needs the key, mirroring `src/db/client.ts:9-21`. Takes explicit ids; has no church-resolution power. | anyone |
| `src/lib/repo/billing.ts` | Cross-church database access keyed on Stripe ids, and the only writer of `status` / `grace_until` / `stripe_*` outside `platform.ts`. | **owner zone only** |
| `src/lib/billing-sync/apply.ts` | "Make the database agree with Stripe for one church." Given a subscription id, re-fetch, map, write. Shared by the webhook and the reconciler so there is one implementation of the rule. | **owner zone only** |
| `src/lib/billing-sync/reconcile.ts` | Walk every billable church, call `apply`, report drift. Resumable. | **owner zone only** |
| `src/app/api/stripe/webhook/route.ts` | Verify the signature, claim the event, delegate, answer with the right status code. Nothing else. | — |
| `src/app/api/stripe/reconcile/route.ts` | `CRON_SECRET` guard, then call the reconciler. | — |
| `src/app/owner/(protected)/[churchId]/BillingCard.tsx` + actions | Everything Rafael can do. | — |
| `src/app/admin/(protected)/configuracoes/` billing block + portal action | Everything a church can see and do. | — |
| `scripts/billing-reconcile.ts` | Operator CLI. English output is fine here. | — |

### The privilege boundary has to change, and honestly

`src/app/api/` is a church-facing root in `tests/privilege-boundary.test.ts:24-28`. The Stripe webhook lives under it and needs cross-church reads and `status` writes. Three things follow.

**First, the boundary widens deliberately, not by accident.** The test's model changes from "one forbidden module" to "an owner-only set and an owner zone":

```
OWNER_ONLY = { src/lib/repo/platform.ts, src/lib/repo/billing.ts, src/lib/billing-sync/** }
OWNER_ZONE = { src/app/owner/**, src/app/api/stripe/**, scripts/**, OWNER_ONLY itself }
```

Everything under `src/app/admin`, `src/app/api`, `src/lib` that is not in the owner zone must not import anything in the owner-only set. `src/app/api/whatsapp/` stays blocked, which is the point: if the inbound-message path could import `repo/billing.ts`, a suspended church's own member message would run through code that can set `status = 'active'`.

**Second, `src/lib/billing-sync/` is owner-only as a directory, not as a file list.** A new file dropped in there is owner-only by default. A file list fails open on the next contributor.

**Third, do not route around it.** The current test checks *direct* imports only (`tests/privilege-boundary.test.ts:78`). A thin route file that delegates to a "helper" in `src/lib/` would pass while the boundary was wide open — which is precisely the failure the brain doc records: a guard that enforces a naming convention while appearing to enforce a boundary. The implementation must inject a violation from `src/app/api/whatsapp/webhook/route.ts`, watch the test go red, and revert, before the change is trusted.

## Becoming a subscriber

Rafael opens `/owner/<churchId>` and clicks **Gerar link de assinatura**. A Server Action creates a Stripe Checkout Session:

- `mode: 'subscription'`, `line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }]`
- `client_reference_id: churchId`
- `subscription_data.metadata.church_id = churchId` and `customer_creation` metadata carrying the same
- `customer: church.stripeCustomerId` when one already exists, so a re-subscribe after cancellation reuses the customer and keeps the invoice history on one record
- `payment_method_collection: 'always'`
- trial days read from the configured Price, not from a constant
- `success_url` → `/assinatura/obrigado`, `cancel_url` → `/assinatura/cancelado`

The action returns the URL. **It is displayed for Rafael to copy, not emailed.** We have no mail infrastructure, and sending a message on a user's behalf is not something this system should start doing as a side effect of a billing click.

**`subscription_data.metadata.church_id` is the load-bearing part.** It means every later `customer.subscription.*` event carries the church id, so `customer.subscription.created` arriving *before* `checkout.session.completed` — which Stripe does not guarantee against — is still enough to bind the church. Binding is order-independent because the identity travels with the object, not with the session.

Church resolution, in order: `subscription.metadata.church_id` → `stripe_subscription_id` lookup → `stripe_customer_id` lookup → unmatched.

The success page is decorative. It renders a fixed pt-BR sentence, reads nothing, takes no id from the query string, and reveals no church. **The webhook does the work.** Trusting the redirect is the classic way to end up with a church that paid and never activated because the pastor closed the tab.

## Event → status mapping

Handled event types (the endpoint is configured in the Stripe dashboard to send only these):

| Event | Effect |
|---|---|
| `checkout.session.completed` | Bind `stripe_customer_id` / `stripe_subscription_id` if not already bound. No status change. |
| `customer.subscription.created` | Bind, then apply state. |
| `customer.subscription.updated` | Apply state. |
| `customer.subscription.deleted` | Apply state (`canceled` → suspended). |
| `charge.dispute.created` | Record only. Visible in `/owner`. |
| `charge.refunded` | Record only. Visible in `/owner`. |
| anything else | Recorded as `ignored`, 200. Its presence is itself a signal that the dashboard configuration drifted. |

"Apply state" means: re-fetch the subscription, then map its status through the one pure function.

| `subscription.status` | `church.status` | Grace |
|---|---|---|
| `trialing` | `active` | cleared |
| `active` | `active` | cleared |
| `past_due` | `past_due` | `COALESCE(grace_until, now + GRACE_PERIOD_MS)` |
| `unpaid` | `suspended` | cleared |
| `canceled` | `suspended` | cleared |
| `paused` | `suspended` | cleared |
| `incomplete` | **unchanged** | unchanged |
| `incomplete_expired` | **unchanged** | unchanged |
| unknown string | **unchanged**, event recorded as `ignored` | unchanged |

`incomplete` means the very first payment never succeeded — the church was never live on this subscription. Writing `suspended` there would take a church that Rafael is still onboarding off the air because a pastor's first card attempt was declined. An unknown status returns `null` for the same reason: a Stripe status we have never seen must not silence a paying church.

`stripe_subscription_status`, `stripe_current_period_end`, `stripe_cancel_at` and `stripe_synced_at` are written on **every** apply, including the ones that leave `status` alone and including overridden churches. That is what makes drift visible instead of invisible.

`cancel_at_period_end: true` deliberately changes nothing but `stripe_cancel_at`. They have paid through the period; they keep the bot until `deleted` arrives.

## The webhook endpoint

`POST /api/stripe/webhook`.

1. **Read the raw body** with `request.text()` before any parsing. Stripe's signature is over the exact bytes.
2. **Verify** with `stripe.webhooks.constructEvent(raw, header, STRIPE_WEBHOOK_SECRET)`. On failure: **400, and nothing is written.** An unverified body must never create a database row — the same discipline as `src/app/api/whatsapp/webhook/route.ts:66-73`, where nothing is acted on before the HMAC check.
3. **Claim** — `INSERT INTO stripe_event (id, type, …) VALUES (…) ON CONFLICT (id) DO NOTHING RETURNING id`.
   - Insert succeeded → this delivery owns the work.
   - Conflict and the existing row has `processed_at IS NOT NULL` → 200 immediately, no work.
   - Conflict and `processed_at IS NULL` → **process it again.** A previous attempt claimed it and did not finish.
4. **Apply**, then `UPDATE stripe_event SET outcome, processed_at = now(), attempts = attempts + 1 WHERE id = $1`.
5. **Answer:** 200 for applied, ignored, and unmatched. 500 for a transient failure — a Stripe API timeout, a database error — with the row left `outcome = 'failed'`, `processed_at` null, so both Stripe's retry and the next reconciliation pass will pick it up.

### No transactions

`db.transaction` does not exist on the neon-http driver. Three consequences, each handled by construction rather than by hope.

**Claim-then-crash.** The window between the claim insert and the `processed_at` write is exactly where an atomic system would use a transaction. Instead the claim is deliberately *weak*: `processed_at IS NULL` means "unproven", and an unproven event is re-processed rather than skipped. Re-processing is safe because applying a fetched state is idempotent — the second run computes the same status from the same subscription and writes the same row. The cost of the design is that a duplicate delivery of an in-flight event does the work twice; the benefit is that no event is ever silently dropped. Losing a `past_due` transition is worse than doing one redundant `UPDATE`.

**Grace-period drift.** `grace_until = now + 7 days` is the one genuinely non-idempotent write in the subsystem: applied twice, it moves the deadline. Two `past_due` events a day apart would silently hand the church eight days instead of seven. Handled in SQL rather than in TypeScript, as one statement:

```sql
UPDATE church
   SET status = 'past_due',
       grace_until = COALESCE(grace_until, $deadline),
       stripe_subscription_status = $raw,
       stripe_synced_at = now()
 WHERE id = $1 AND billing_override = false
```

Postgres gives single-statement atomicity without an explicit transaction, so **every write in this subsystem is one statement whose `WHERE` and `SET` express the entire rule** — including the override check, which is a predicate rather than a read-then-write race. `setChurchStatus` already clears `grace_until` when moving to `active` or `suspended` (`src/lib/repo/platform.ts:95-96`), so `COALESCE` correctly restarts the clock on a *new* delinquency and preserves it on a repeated one.

**Binding two ids.** `stripe_customer_id` and `stripe_subscription_id` are written in the same single `UPDATE`. They cannot half-commit. If the unique index rejects the write because another church already holds that `cus_…`, the event is recorded `failed` with the constraint name and surfaces in the repair queue — the same story as the `church_phone_number_id_uq` handling at `src/app/owner/(protected)/[churchId]/actions.ts:38-42`.

## Reconciliation

Stripe is the source of truth for the subscription. The database is the source of truth for what the product does. Reconciliation is the process that makes the second agree with the first.

`reconcileAllChurches()` walks every church with a `stripe_subscription_id` and, for each one:

1. Retrieves the subscription from Stripe.
2. Calls the **same** `apply` the webhook calls. There is one implementation of the mapping rule; a reconciler with its own copy is a second rule that will diverge.
3. Records whether the stored status differed from the computed one — that difference is the drift report.

It then reports, without changing anything:

- churches with **no** `stripe_subscription_id` (never subscribed, or subscribed outside the system),
- Stripe subscriptions whose `metadata.church_id` matches no church row (orphans on Stripe's side),
- `stripe_event` rows still `received` or `failed`.

**Resumability.** Each church is one retrieve and one single-statement update. A crash halfway through leaves a partially reconciled set, which is a *correct* state — every church processed is correct, every church not yet processed is unchanged — and the next run finishes the job. There is no batch to roll back because there is no batch.

**Overridden churches are read but not written.** Their `stripe_subscription_status` and `stripe_synced_at` update; their `status` and `grace_until` do not. The drift report lists them separately, because for an overridden church drift is the intended state and reporting it as an error would train Rafael to ignore the report.

Three entry points, one implementation: a daily Vercel Cron hitting `/api/stripe/reconcile` behind `CRON_SECRET`, a **Reconciliar agora** button in `/owner`, and `npm run billing:reconcile` for when the app itself is the suspect.

The multi-church spec argued against cron because "there is no scheduler to fail silently." That argument still holds and is why grace expiry remains computed on read. This cron is not load-bearing: if it never runs once, the system is exactly as correct as the webhooks left it. And its silence is not silent — `/owner` shows the age of `stripe_synced_at` per church and warns past two days.

## The owner console

A new **Assinatura** card on `/owner/[churchId]`, above the existing WhatsApp credentials card.

**Not yet subscribed** (`stripe_customer_id` is null): a **Gerar link de assinatura** button, and after generating, the URL with a copy control and its expiry. Also a **Vincular cliente do Stripe** field taking a `cus_…`, for a church whose subscription was created directly in the dashboard.

**Subscribed:** the raw Stripe status in Portuguese, the mapped `church.status`, next-charge date, scheduled-cancellation date if any, last-sync age, a deep link to the customer in the Stripe dashboard, a **Reconciliar agora** button, and the last ten `stripe_event` rows for this church — which is where a `charge.dispute.created` becomes visible without a dedicated column for it.

**Override:** a toggle with a required reason field. While on, a persistent badge names the date and the reason, and the existing `StatusControls` gains a warning that a manual status change *without* the override will be overwritten by the next Stripe event. That warning matters: today manual status is the only mechanism, and after this ships it becomes the *losing* side of a race unless the override is on.

**Unmatched events** get their own section on `/owner`: type, `cus_…`, date, and a control to bind it to a church. This is the repair path for the "event names a church that does not exist" case, and without it those events are a log line nobody reads.

## What the church sees

Deliberately close to nothing.

The two existing banners in `src/app/admin/(protected)/layout.tsx:32-42` already cover the states. The `past_due` banner gains the actual deadline, which the layout already has in hand.

`/admin/configuracoes` gains a small read-only **Assinatura** block: situation, next-charge or trial-end date, and one button — **Atualizar forma de pagamento** — which opens a Stripe Billing Portal session for *this church's own* customer. No amounts, no plan selection, no invoice list; the portal shows invoices better than we would, and re-implementing it means mirroring money into our database.

Two subtleties:

- **The portal action cannot use `requireWritableSession`.** That guard refuses a suspended church (`src/lib/auth/writable.ts:29-31`), and a suspended church paying its bill is precisely the outcome we want. The action uses `requireReadableSession` and is documented as the one deliberate exception, with the `churchId` taken from the session and never from client input — the customer id is read from the caller's own church row, so no cross-church power is granted.
- **The portal configuration must not offer cancellation.** Otherwise this button is a self-service off switch.

There is no relationship between this subsystem and the **Ofertas** menu item. Ofertas is what a member gives their church; assinatura is what a church pays the vendor. They never appear on the same screen and never share vocabulary.

## Failure modes

| Failure | What happens |
|---|---|
| **Expired card** | Stripe's dunning runs (dashboard-configured). `subscription.status → past_due` → we write `past_due` + a 7-day deadline → banner with the date. A Smart Retry that succeeds sends `active` → we clear the deadline. If dunning ends in `canceled` or `unpaid`, both map to `suspended`. The mapping is identical whichever ending Rafael configures. |
| **Grace expires** | Nothing runs. `effectiveStatus` reads `past_due` past `grace_until` as `suspended` (`src/lib/church-status.ts:18-20`), the webhook stops sending, the panel goes read-only. Unchanged by this work. |
| **Dispute** | Recorded, listed in `/owner`, no status change. |
| **Refund** | Recorded, listed, no status change. A refund does not cancel a subscription; if Rafael wants them off he cancels in Stripe. |
| **Cancelled in the Stripe dashboard** | `updated` with `cancel_at_period_end` → we store the date and change nothing. `deleted` at period end → `suspended`. Cancelled immediately → `deleted` at once → `suspended` at once. |
| **Church pays after suspension, subscription still exists** | An invoice is paid → `active` → the bot wakes up for **new** messages. Conversations that went cold during suspension **cannot be answered**: Meta's 24-hour service window is measured from `contact.lastInboundAt` (`src/lib/reply-window.ts:6-9`) and has closed. Those threads sit in the Caixa de Entrada until the member writes again. This is a real product consequence of suspension and it should be said out loud to a church before it is suspended, not discovered afterwards. |
| **Church pays after suspension, subscription deleted** | A paid invoice does not resurrect a deleted subscription. Rafael generates a new Checkout link; passing the existing `customer` keeps one billing history. |
| **Event names an unknown church** | Recorded `unmatched`, **200** — three days of retries cannot create a church row. Appears in the `/owner` repair queue. |
| **Forged or unsigned payload** | 400. No row written. |
| **Duplicate delivery, already processed** | 200, no work. |
| **Duplicate delivery, claim unproven** | Re-processed. Safe by construction. |
| **Crash between claim and apply** | Row stays `processed_at IS NULL`. Stripe's retry re-processes it; if Stripe has given up, reconciliation repairs the church anyway, because reconciliation works from subscriptions rather than from events. |
| **Stripe API down during the re-fetch** | 500 → Stripe retries with backoff. Row `failed`. Reconciliation is the backstop. |
| **Webhook endpoint disabled by Stripe after sustained failures** | The only detector is `stripe_synced_at` age in `/owner`, which is exactly why that field exists. |
| **Two lambdas race on the same church** | Both re-fetch the same current state and write the same values. The one non-idempotent write is handled by `COALESCE`. |
| **`cus_…` already bound to another church** | Unique-index violation → event `failed` with the constraint name → repair queue → Rafael clears the stale link first. |
| **`STRIPE_PRICE_ID` unset or pointing at a deleted price** | The Checkout action fails with a named pt-BR error rather than a stack trace. No church state changes. |
| **Price changed in the dashboard** | Existing subscriptions keep the old price; Stripe does not migrate them. Updating the env var only affects churches subscribed after the change. This surprises people and is worth writing on the wall. |

## User-facing strings

Every string below is Brazilian Portuguese and appears verbatim in the implementation. `{data}` is `dd/mm/aaaa`, `{n}` an integer, `{motivo}` free text.

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
- `Envie este link para a igreja. Ele expira em 24 horas.`
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
- `Vincular cliente do Stripe`
- `ID do cliente (cus_…)`
- `Este cliente do Stripe já está vinculado a outra igreja. Desvincule-o lá primeiro.`
- `Últimos eventos`
- `Nenhum evento ainda.`

### Owner console — override

- `Manter ativa independentemente do Stripe`
- `Motivo (obrigatório)`
- `Informe o motivo do controle manual.`
- `Enquanto isso estiver ligado, nenhum evento do Stripe altera a situação desta igreja.`
- `⚠️ Situação controlada manualmente desde {data} — {motivo}`
- `Desligar controle manual`

### Owner console — StatusControls addition

- `Alterar a situação manualmente não dura enquanto o controle manual estiver desligado: o próximo evento do Stripe sobrescreve.`

### Owner console — unmatched events

- `Eventos sem igreja`
- `Nenhum evento pendente.`
- `{tipo} · cliente {cus_…} · {data}`
- `Vincular a uma igreja`

## Environment and dashboard configuration

New variables, added to `.env.example` — whose current claim that `DATABASE_URL` is "the ONLY secret this app needs" stops being true and must be corrected in the same change:

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server-side API key. |
| `STRIPE_WEBHOOK_SECRET` | Endpoint signing secret. |
| `STRIPE_PRICE_ID` | A **pointer**. Amount, currency, interval and trial live on the Price object in the dashboard. |
| `APP_BASE_URL` | Absolute base for `success_url` / `cancel_url`. |
| `CRON_SECRET` | Vercel-injected; guards the reconcile route. |

Dashboard configuration that is part of "done", not optional afterwards:

1. A recurring BRL Price with the trial configured on it.
2. The webhook endpoint subscribed to exactly the six handled event types.
3. Dunning (Smart Retries and the end-of-dunning action) configured; either ending maps correctly.
4. A Billing Portal configuration with **payment-method update and invoice history enabled, cancellation disabled**.
5. `vercel.json` with the daily cron entry — the repo has no `vercel.json` today, so this creates one.

## Testing

Everything runs on PGlite and pure functions. Nothing ever touches live Stripe.

- **`mapStripeStatus`** — all eight documented Stripe statuses, plus an unknown string, plus the empty string. The unknown case must return `null`, not throw and not suspend.
- **Signature verification is real, not mocked.** Stripe's scheme is an HMAC over `"{timestamp}.{payload}"`, so tests can construct genuinely valid signatures from a known `STRIPE_WEBHOOK_SECRET`, exactly as `tests/webhook-suspension.test.ts` builds real Meta signatures. A tampered body and a stale timestamp must both 400.
- **Webhook route against PGlite** with the Stripe client stubbed at `src/lib/billing/stripe-client.ts` (one module to stub, which is the reason it exists): unknown church → `unmatched` + 200; duplicate processed → no second write; duplicate unproven → re-processed; `past_due` twice → `grace_until` unchanged on the second; overridden church → `status` untouched, `stripe_synced_at` updated; `incomplete` → nothing changes.
- **Out-of-order delivery** — deliver `updated(active)` after `updated(past_due)` with the stub returning the *current* subscription, and assert the church ends up matching the stub rather than matching the last event body. This is the test that proves the re-fetch decision.
- **Reconciliation** — drift repaired; override respected; a throw partway through leaves earlier churches correct and later churches untouched, and a second run completes.
- **Privilege boundary** — extended as described, and *watched failing* before it is trusted.
- **Tenant isolation** — one added assertion: deleting a church leaves its `stripe_event` rows present with a null `church_id`, so the deliberate `ON DELETE SET NULL` exception is tested rather than assumed.

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
- Checkout Session expiry semantics and the exact 24-hour claim in the copy.
- The Billing Portal configuration model and whether cancellation can in fact be disabled.
- Stripe's webhook timeout and retry schedule.
- Whether Stripe Brazil's onboarding for BRL settlement requires a CNPJ, and what that implies for Rafael's entity.
- Whether the event type names are stable for the API version the SDK pins.

**No live database exists.** Nothing in this repository has ever executed against Neon; migration `0004` will be applied to PGlite in tests and to a real server for the first time in production. The single-statement atomicity the no-transaction design depends on is a property of Postgres that PGlite genuinely exercises — that part is testable. The behaviour of the neon-http driver under concurrent lambdas is not.

**No live deployment exists.** Vercel Cron has never run for this project, `CRON_SECRET` has never been injected, and the reconciliation route has never been called by anything but a test.

**One thing is testable and must not be waved away:** the signature check, the idempotency claim, the status mapping, the grace-period `COALESCE`, the override predicate, and the privilege boundary are all exercisable on PGlite with a stubbed Stripe client. Those are where the bugs that cost money live, and there is no excuse for shipping them unverified.

## Prerequisite

This sits behind stage 7 of the roadmap. **A church should be live, connected to Meta, and answering real members before its payment can fail.** Billing that automates the suspension of a bot nobody has ever spoken to automates nothing.
