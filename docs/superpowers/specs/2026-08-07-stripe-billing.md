# Secretária Virtual — Stripe Billing

**Design doc** · 2026-08-07 · Status: proposed · **Revision 3** (see Revisions)

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
| Collection method | `charge_automatically` — **card only. Settled by the owner; not open** | A card is a stored credential, so Stripe can retry it without the payer acting. That is what makes the whole lifecycle automatic: a failed charge moves the church to `past_due` by itself, grace runs, suspension follows, and a successful Smart Retry reactivates it with nobody in the loop. `send_invoice` (PIX, boleto) removes automatic recovery entirely. See "PIX and boleto" for what a later reversal would cost. |

## Architecture

### Schema changes

One new migration, generated by `npm run db:generate`. Migrations `0000`–`0003` are never edited.

**On the migration number.** Three unshipped specs — this one, `2026-08-07-lgpd-data-subject-tooling.md` and `2026-08-07-nota-fiscal.md` — each add a migration, and each was written assuming it would be `0004`. They cannot all be. The number is whatever `npm run db:generate` assigns at the moment this subsystem is built; whichever ships second and third **regenerates rather than renames**, because the file name and the `_journal.json` entry must agree. The plan must not hardcode a number.

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
| `attempts` | `integer NOT NULL DEFAULT 0` | Incremented by every processing run that **reaches a conclusion** — the success write and the failure write each do it once. A run killed mid-flight cannot increment it, which is exactly why "unfinished" is `processed_at IS NULL` and never a count. See the webhook steps. |
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
| `src/lib/billing/stripe-portal.ts` | The **only** Stripe surface church-facing code may reach: `createPortalSession(returnUrl)` and nothing else. Takes **no tenant identifier at all** — it reads the session itself and resolves the customer from that church's own row. Cannot list, search, or mutate anything. | anyone |
| `src/lib/billing/stripe-client.ts` | The general Stripe client — subscription retrieve/list, customer lookup, Checkout session creation. Lazy client construction so `next build` never needs the key, mirroring `src/db/client.ts:9-21`. Pins `apiVersion`. | **owner zone only** |
| `src/lib/repo/billing.ts` | Cross-church database access keyed on Stripe ids, and the only writer of `status` / `grace_until` / `stripe_*` outside `platform.ts`. | **owner zone only** |
| `src/lib/billing-sync/apply.ts` | "Make the database agree with Stripe for one church." Given a subscription id, re-fetch, map, write — in one statement. Shared by the webhook and the reconciler so there is one implementation of the rule. | **owner zone only** |
| `src/lib/billing-sync/reconcile.ts` | Walk a bounded, ordered page of billable churches, call `apply`, report drift. Resumable across runs. | **owner zone only** |
| `src/app/api/stripe/webhook/route.ts` | Verify the signature, claim the event, delegate, answer with the right status code. Nothing else. | — |
| `src/app/api/stripe/reconcile/route.ts` | `CRON_SECRET` guard, then call the reconciler. Declares `maxDuration`. | — |
| `src/app/owner/(protected)/[churchId]/BillingCard.tsx` + actions | Everything Rafael can do. | — |
| `src/app/admin/(protected)/configuracoes/` billing block + portal action | Everything a church can see and do. | — |
| `scripts/billing-reconcile.ts` | Operator CLI, wired as `"billing:reconcile": "tsx scripts/billing-reconcile.ts"`. English output is fine here. | — |

**Why `stripe-portal.ts` is a separate module from `stripe-client.ts`.** Both read the same platform-wide `STRIPE_SECRET_KEY` from the same process — the split does not hide the secret, and pretending otherwise would be theatre. What it buys is *capability narrowing*. The general client can enumerate customers and mutate subscriptions; a church-facing action that could import it is one careless refactor away from taking a `cus_…` out of a form and opening another church's billing portal.

**Narrowing the verbs was not enough, and revision 3 narrows the arguments.** The re-attack's residual finding was correct: a module that anyone may import and that accepts an arbitrary `cus_…` still has its "which customer" answer living in prose plus one test on the one call site that happens to exist. A second call site written next year is caught by nothing. So the parameter is deleted. `createPortalSession(returnUrl: string)` calls `requireReadableSession()` (`src/lib/auth/writable.ts:75-84`) and `getChurchById(session.churchId)` (`src/lib/repo/church-admin.ts:7-10`) *inside the module*, and returns a portal URL for that row's `stripe_customer_id`, or a refusal when it has none. There is no argument a caller can substitute, so importing this module grants exactly the capability the caller's own session already carries — which is what lets the "may be imported by" column honestly say *anyone*.

Two accepted costs, stated rather than discovered. The module becomes request-scoped: `/owner`, the reconciler and the CLI cannot call it, because none of them has an admin session. That is fine here — `/owner` deep-links to the customer in the Stripe dashboard, which is strictly more useful to Rafael than a portal session would be. And `src/lib/billing/` now depends on `src/lib/auth/`, so this is not a pure SDK wrapper. It stays testable the way the existing guard tests already are: `tests/session-guards.test.ts:36-43` stubs `@/lib/auth/session` and exercises `requireReadableSession` against PGlite, and the portal test uses the same stub.

### The privilege boundary has to change, and honestly

`src/app/api/` is a church-facing root in `tests/privilege-boundary.test.ts:24-28`. The Stripe webhook lives under it and needs cross-church reads and `status` writes. Five things follow.

**First, the boundary widens deliberately, not by accident.** The test's model changes from "one forbidden module" to a scan set, an owner-only set, and an owner zone — three sets, because conflating any two of them is what produced the holes below:

```
SCAN_ROOTS = { src/app, src/lib, scripts }
OWNER_ONLY = { src/lib/repo/platform.ts, src/lib/repo/billing.ts,
               src/lib/billing/stripe-client.ts, src/lib/billing-sync/** }
OWNER_ZONE = { src/app/owner/**, src/app/api/stripe/**, scripts/**, OWNER_ONLY itself }
```

Every scanned file that is not in the owner zone must not import anything in the owner-only set. `src/app/api/whatsapp/` stays blocked, which is the point: if the inbound-message path could import `repo/billing.ts`, a suspended church's own member message would run through code that can set `status = 'active'`.

**Second, the scan root becomes `src/app`, and that is a fix rather than a tidy-up.** Today `CHURCH_FACING_ROOTS` is exactly `src/app/admin`, `src/app/api`, `src/lib` (`tests/privilege-boundary.test.ts:24-28`). That is complete only by coincidence of the current tree: `src/app` today holds `admin/`, `api/`, `owner/`, plus `layout.tsx` (an `<html lang="pt-BR">` shell) and `page.tsx` (a redirect to `/admin`) — verified. This spec adds `src/app/assinatura/obrigado` and `src/app/assinatura/cancelado`, a **new child of `src/app`**, and public and unauthenticated at that. Under the current roots no rule in the suite would ever look at them: not the owner-only rule, not the bare-`stripe` rule below, not any rule a future contributor adds. Adding the two page paths to the roots list would close this instance and leave the next one open, so the root becomes `src/app` wholesale and the *owner zone* does the excluding — the same separation-of-sets argument the `walk()` paragraph below makes, applied one level up. The suite's own tripwire (`expect(files.length).toBeGreaterThan(40)`, `:75`) then covers every route the repo ships rather than the subset somebody remembered to list.

`scripts/` joins the scan set too, and here the spec has to be plain instead of reassuring: `scripts/**` is *also* in the owner zone, so **no rule currently applies to any file in it**, and its entry buys visibility rather than enforcement. The three scripts that exist (`create-admin.ts`, `create-owner.ts`, `create-church.ts`) are operator CLIs Rafael runs with `DATABASE_URL` in his own shell, and `billing-reconcile.ts` joins them; they are owner-zone code by intent. But listing `scripts/**` in `OWNER_ZONE` while nothing scanned `scripts/` at all was worse than omitting it — it named a coverage that did not exist. Being in the scan set is what makes the exemption a real exemption.

**Third, `walk()` must stop skipping the allowed set.** Today `walk()` filters with `!ALLOWED.has(full)` (`tests/privilege-boundary.test.ts:45`), so the one owner-only file is never itself scanned. That was harmless with a single file. It is not harmless with an owner-only *directory*: `src/lib/billing-sync/**` would become a region of `src/lib` that no rule in the suite ever looks at — including the bare-specifier rule below, and including any rule a future contributor adds. The fix is to separate the two concerns the single set is currently doing double duty for. `walk()` returns **every** file; the rule then asks each file which zone it is in and applies the check only to non-owner files. Same outcome for `platform.ts`, and a directory can be exempted from a *rule* without becoming invisible to the *scan*.

**Fourth, the resolver is blind to bare package specifiers, and that now matters.** `resolveSpecifier` returns `null` for anything that is not `@/` or relative (`tests/privilege-boundary.test.ts:53-59`, the bare-specifier `return null` on line 57), which was correct when the only thing worth guarding was a local module. It means a church-facing file can write `import Stripe from 'stripe'`, construct its own client with `process.env.STRIPE_SECRET_KEY`, and hold full platform-wide Stripe capability while every existing assertion passes. The split in the previous section is worth nothing without this. So the suite gains a second, separate rule: **the raw specifier `stripe` (and any `stripe/…` subpath) may appear only in the owner zone and in `src/lib/billing/stripe-portal.ts`.** This is a text rule rather than a resolution rule, and it is honest about being one.

**Fifth, do not route around it.** The current test checks *direct* imports only (`tests/privilege-boundary.test.ts:78`). A thin route file that delegates to a "helper" in `src/lib/` would pass while the boundary was wide open — which is precisely the failure the brain doc records: a guard that enforces a naming convention while appearing to enforce a boundary (`brain/02 Architecture/Multi-Tenancy.md:56`, verified). The implementation must inject violations and watch each go red before the change is trusted: one owner-only import and one bare `import Stripe from 'stripe'` from `src/app/api/whatsapp/webhook/route.ts`, and **the same pair again from `src/app/assinatura/obrigado/page.tsx`** — that second pair is the one that passes under the roots as they stand today, so it is what proves the scan actually widened rather than merely being described as wider.

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

Both return pages live at **`src/app/assinatura/**`** — public, unauthenticated, and a *new* child of `src/app`. That is the concrete reason the privilege scan's root moves up a level in the section above: under the roots as they stand today these files would ship without any rule in the suite ever having looked at them.

### Linking a church that subscribed outside the flow

**Vincular cliente do Stripe** exists for the church whose subscription Rafael created directly in the dashboard. Taking only a `cus_…` and writing only `stripe_customer_id` produces a church that no webhook will ever bind — the `created` event already fired and was recorded `unmatched` before the link existed — and that reconciliation would never revisit if reconciliation walked only churches with a `stripe_subscription_id`. That is the exact hole the feature exists to close, dug by the feature itself.

So the bind action does not write a bare customer id. It:

1. Calls `subscriptions.list({ customer, status: 'all', limit: 2 })`.
2. **Exactly one** → hands that subscription's id straight to `apply` and writes **nothing else**. The church is bound, status-driven and drift-checked from that moment. Revision 2 had this branch write both ids first and *then* apply; that pre-write is redundant, because `apply` writes `stripe_customer_id` and `stripe_subscription_id` itself, and it opened a real window — if the write landed and the apply then threw, the church sat bound with every mirror column null and a `status` already stale. Deleting the first statement makes the bind atomic by construction, which is the same argument as everywhere else in this document. The cost is one extra retrieve, since `apply` re-fetches the subscription `subscriptions.list` just returned; at this volume that is not a cost worth a second code path.
3. **Zero** → refuses with `Este cliente não tem nenhuma assinatura no Stripe. Crie a assinatura primeiro.` Nothing is written.
4. **Two or more** → refuses with `Este cliente tem mais de uma assinatura. Informe o ID da assinatura (sub_…) diretamente.` and the form reveals a second field taking a `sub_…`.

And, belt and braces, **reconciliation's candidate set is `stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL`.** A customer-only church resolves its subscription the same way the bind action does and is then bound. The structural guarantee does not depend on one action having been written correctly.

## Event → status mapping

Handled event types (the endpoint is configured in the Stripe dashboard to send only these):

| Event | Effect |
|---|---|
| `checkout.session.completed` | Resolve the church from `session.client_reference_id`, then hand `session.subscription` to `apply` — **the same call `customer.subscription.created` makes, with no special case**. A session carrying no `subscription` never reaches `apply`: outcome `recorded`. |
| `customer.subscription.created` | Apply state. The bind is not a separate step — the same statement writes both ids. |
| `customer.subscription.updated` | Apply state. |
| `customer.subscription.deleted` | Apply state (`canceled` → suspended). |
| `charge.dispute.created` | Resolve to a church, record only. Visible in `/owner`. Outcome `recorded`. |
| `charge.refunded` | Resolve to a church, record only. Visible in `/owner`. Outcome `recorded`. |
| anything else | Recorded as `ignored`, 200. Its presence is itself a signal that the dashboard configuration drifted. |

"Apply state" means: re-fetch the subscription, then map its status through the one pure function.

### `checkout.session.completed` had no statement, and now runs the ordinary one

Revision 2 left this row saying "bind ids, no status change" after the same revision made the apply statement the *sole* writer of `stripe_customer_id` and `stripe_subscription_id`. Those two sentences cannot both be true. Apply always writes `status` when `$mapped` is non-null, and always writes `stripe_subscription_status`, `stripe_current_period_end`, `stripe_cancel_at` and `stripe_synced_at = now()` with no `COALESCE`. So the row described either a statement that does not exist, or a call to `apply` with nulls — which would blank three mirror columns and advance the freshness clock on the strength of an event that confirmed nothing. One of six configured events had no coherent statement.

The fix is a deletion, not an addition: **the special case goes away.** The handler resolves the church from `session.client_reference_id` and calls `apply(churchId, session.subscription)` — the same call every other subscription event makes, running the same single statement. Outcome `applied`. There is no "bind-only" mode and no second statement.

Three consequences worth stating.

- **It is deliberately redundant with `customer.subscription.created`, and that is the point.** Both may fire, in either order, and both run the identical idempotent statement against a freshly retrieved subscription — the property the "re-fetch, don't trust the payload" decision exists to produce. Two applies are two identical writes.
- **It is still worth subscribing to.** `client_reference_id` is *our* church id, set server-side when the session was created. It is the one binding path that does not depend on `subscription_data.metadata` having been set correctly, so it is a genuine second route to the same answer rather than a duplicate of the first. Resolution order for this event: `client_reference_id` → `stripe_customer_id` lookup on `session.customer` → unmatched.
- **A session with no subscription never touches `church`.** If `session.subscription` is null there is nothing to retrieve and nothing about a subscription to confirm, so the event follows the charge-event discipline instead: write the `stripe_event` row with whatever ids resolved, outcome `recorded` if a church was found and `unmatched` if not, and leave the church row alone — including `stripe_synced_at`.

**The invariant this rests on: `apply` cannot be called with partial data.** Its signature is `apply(churchId, subscriptionId)` — two ids and nothing else. It performs the retrieve itself, which is the same fact as the "don't trust the payload" decision seen from the other side: there is exactly one place in the subsystem that turns a `sub_…` into a subscription object, and it is inside `apply`. So no caller can hand it a half-filled record, because no caller hands it a record at all. `$subscription` comes from the retrieved `subscription.id` and `$customer` from `subscription.customer`.

**That is why the four mirror columns are written unconditionally and need no `COALESCE`.** No path can reach the statement with a null it did not mean, and `stripe_synced_at = now()` is therefore true whenever it is written. The corollary is the rule that closes this finding: **a handler with no `sub_…` in hand must not call `apply` at all.** The `checkout.session.completed` branch above and the two charge events below are the three instances of it, and all three record the event instead.

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

**`incomplete_expired` gets the same `hold`, and the cost of that is named rather than hidden.** It is terminal — the first payment window closed and the subscription is dead — so a church left `active` under it stays `active` indefinitely, and because `previous_status == new_status` the drift report says nothing. The re-attack is right that the onboarding argument covers `incomplete` and not this. It is kept anyway, because the alternative is a status mapping that can suspend a church Stripe never charged, and every other fail-open choice in this product points the same way. **The detector is the `/owner` card, not the drift report**: an `incomplete_expired` church has both Stripe ids, so it is in the reconciled set, its `stripe_synced_at` stays fresh, and the card reads `Situação no Stripe: Incompleta (expirada)` against a `church.status` of `Ativa` — a divergence a human can see on the page that exists to show it. Whether that is enough, or whether `incomplete_expired` should map to `suspended`, is a product call and is on the open list below.

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
4. **Close the row on success**, in one statement: `UPDATE stripe_event SET outcome, church_id, stripe_customer_id, stripe_subscription_id, processed_at = now(), attempts = attempts + 1 WHERE id = $1`.
5. **Fail the row on a throw**, also in one statement: `UPDATE stripe_event SET outcome = 'failed', error = $2, attempts = attempts + 1 WHERE id = $1`. `processed_at` is deliberately *not* written, so both Stripe's retry and the next reconciliation sweep still see unfinished work.
6. **Answer:** 200 for applied, recorded, ignored, and unmatched. 500 for a transient failure — a Stripe API timeout, a database error — because a Stripe retry is free and is the repair mechanism.

**What `attempts` counts, precisely.** Revision 2's schema said "incremented on each processing attempt" while the only increment sat on the success path, so a poison event read `attempts = 0` forever — the column contradicted its own description. Step 5 makes the failure path increment it too, which is the smallest correction: a repeatedly failing event now shows a rising count in the repair queue, which is what makes "this one is not going to fix itself" legible to Rafael. The one case it still cannot count is a lambda killed between the claim and either update, and no counter written by that lambda ever could. `processed_at IS NULL` is the pending signal; `attempts` is the *diagnosis*, not the state.

**There is no dead-letter cap, and that is deliberate.** Nothing stops re-processing after N attempts, because the two things that would otherwise re-drive an event forever are already bounded by something other than us: Stripe's own retry schedule ends on its own, and reconciliation never replays events at all — it works from subscriptions, so a poison `stripe_event` row cannot make it loop. The row's terminal state is a human looking at the repair queue. A numeric cap would add a rule whose only effect is to hide a row that needs attention.

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

**Revision 2 claimed an interlock here that does not exist. It is struck, not softened.** The claim was that under the old `WHERE billing_override = false` apply form "an overridden church would never advance its cursor and would sort to the front of every run forever", making the override fix a precondition for this one. That is false. The cursor is written by the one-line statement immediately above, which is not the apply statement and carries no override predicate of any kind — an overridden church advances its cursor whatever shape `apply` has, so the starvation described cannot occur. The seventh column stands on the reason given in the schema section, health versus progress, and needs no help from the override fix. What the `CASE` form actually buys reconciliation is stated further down under "Overridden churches are read and mirrored": fresh mirror columns for the drift report to compare against, not forward progress. The two fixes are independent, and a document whose credibility rests on separating what was verified from what was assumed cannot afford to present a rhetorical link as a structural one.

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

- **The portal path cannot use `requireWritableSession`.** That guard refuses a suspended church (`src/lib/auth/writable.ts:29-31`), and a suspended church paying its bill is precisely the outcome we want. `createPortalSession` uses `requireReadableSession`, which deliberately does not block on suspension (`src/lib/auth/writable.ts:66-67`), and this is documented as the one deliberate exception. The action itself passes only a `returnUrl`: it has no customer id and no church id to get wrong, because the module resolves both from the session. The privilege suite's bare-specifier rule stops the action importing the SDK directly and going around it.
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
| **Crash between the apply and the closing write** | The **church** row is already correct and complete. The `stripe_event` row is left `outcome = 'received'`, `processed_at` null, `attempts` unincremented and `church_id` null — so it reads as pending in the repair queue while its work is in fact done, and a `charge.dispute.created` in that state never reaches that church's **Últimos eventos** list. Stripe's retry re-processes it and fills the row in. If the retries are already exhausted it needs a human. Accepted, not engineered away: closing it needs either a transaction, which neon-http does not have, or resolving the church *before* doing the work — which for the charge events means the Stripe call that is itself what crashed. This is the one durable gap in the event trail and it is named in Revision 3 rather than left to be discovered. |
| **Checkout completed but the session names no subscription** | Nothing calls `apply`. The event is `recorded` against the church resolved from `client_reference_id`, or `unmatched` if none resolves. The church row is untouched — `stripe_synced_at` included, because nothing about a subscription was confirmed. |
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

**The `.env.example` header comment is already wrong and this change makes it worse.** Line 1 reads "the ONLY secret this app needs" while `SESSION_SECRET` sits on line 7 and `BLOB_READ_WRITE_TOKEN` on line 10 of the same file. The previous draft of this spec said that claim "stops being true", implying it is true now; it has been false since the session and blob work shipped. The correction is part of this change, framed as fixing an existing inaccuracy rather than introducing one.

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
- **Portal isolation** — `createPortalSession` takes no tenant identifier, so the test asserts what is left. With the session stubbed to church A (the `tests/session-guards.test.ts:36-43` pattern) it resolves A's `stripe_customer_id` and nothing else; with the session's church holding no customer id it refuses with `Esta igreja ainda não tem assinatura. Entre em contato com o suporte.`; and a suspended church still gets a session. Revision 2's assertion — "the action ignores any customer id present in its input" — is deleted because there is no longer an input to ignore.
- **`checkout.session.completed`** — a session naming a subscription produces exactly the church row `customer.subscription.created` produces for the same stub, outcome `applied`; delivering both in either order leaves that row byte-identical, which is the redundancy claim made testable. A session with no `subscription` leaves every column of `church` unchanged, `stripe_synced_at` included, and records `recorded`.
- **`attempts`** — an event whose apply throws every time is delivered three times and reads `attempts = 3`, `outcome = 'failed'`, `processed_at IS NULL`. This is the regression test for a column that previously described behaviour it did not have.
- **Privilege boundary** — extended as described, and *watched failing* before it is trusted: one injected owner-only import and one injected bare `import Stripe from 'stripe'`, from `src/app/api/whatsapp/webhook/route.ts` **and** from `src/app/assinatura/obrigado/page.tsx` — the second pair is the one that would have passed under the old roots, so it is the test that proves the scan actually widened. Plus a test that `walk()` now returns the owner-only files themselves, so the directory exemption cannot silently shrink the scan.
- **Tenant isolation** — one added assertion: deleting a church leaves its `stripe_event` rows present with a null `church_id`, so the deliberate `ON DELETE SET NULL` exception is tested rather than assumed.
- **`admin read guard`** — no change needed and none made; `configuracoes/page.tsx` already imports and calls `requireReadableSession` (`src/app/admin/(protected)/configuracoes/page.tsx:1,9`) and the billing block is added inside it. Stated here so the next reader knows it was checked rather than overlooked.

## PIX and boleto — settled: card only

**This is no longer an open question.** The owner has decided: churches pay by card, no PIX, no boleto. It is recorded as binding in `.superpowers/sdd/owner-decisions-2026-08-07.md`, and it is the deciding constraint on the whole lifecycle rather than a payment-method preference — a card is a stored credential, so **automatic dunning is available**, and that is what lets `past_due` → grace → `suspended` → recovery run end to end with no action from Rafael. Every "no human involved on either edge" claim in this document is downstream of it. The rest of this section is the reasoning, kept because the revisit will need it.

Stripe supports both in Brazil, and neither fits this design.

PIX is a push payment: there is no stored credential to charge, so every cycle needs the payer to act. Boleto is the same shape with a longer settlement. Recurring collection with either means moving the subscription to `collection_method: 'send_invoice'`, where Stripe emails a hosted invoice each period and waits. That removes Smart Retries and automatic recovery entirely, which would promote the 7-day grace period from a backstop to the primary mechanism.

One useful property: because status is mapped from `subscription.status`, and that field means the same thing under both collection methods, **switching to invoice collection later requires no change to the mapping, the webhook, or the reconciler** — only to how the subscription is created. What would change is the automation, not the model.

The revisit trigger is named in the owner decisions: the first church that refuses to pay by card. Until then, nothing in this document is designed around either method.

## Out of scope

- Self-serve signup and a public pricing page.
- Proration, multiple tiers, plan changes, usage-based billing, coupons.
- PIX and boleto collection.
- Invoice rendering, receipts, or payment history in our panels — the Stripe Billing Portal owns that.
- Dunning emails from us. Stripe sends them, configured in the dashboard.
- Multi-currency.
- **Nota fiscal — now its own subsystem, with its own spec.** The owner has decided to integrate a Brazilian invoicing service (NFE.io, Omie or similar) so a nota fiscal is issued automatically when Stripe reports a successful payment. That is a second external integration with its own credentials, its own tax configuration and its own failure modes, and it fails *independently*: a payment can succeed while the nota fails, at which point the church owes nothing and Rafael still owes a document. It is not an open question on this spec and it is not a footnote — it is a separate design. **This spec's entire obligation toward it is to make the subscription a reliable record of what was charged and when**, so the invoicing subsystem has something correct to read: Stripe as the single source of truth for money, `stripe_subscription_id` bound to exactly one church, `stripe_event` as an audit trail that survives the church being deleted, and no mirrored `amount` column to disagree with Stripe. All four of those are already properties of this design; nothing has to be added here to serve it.

## What cannot be verified here

The honest list, in the spirit of the existing roadmap's "what is written but has never executed".

**No live Stripe account exists**, so every one of these is a claim to be checked against the real API on first run, not a fact:

- The exact location of `current_period_end` — recent Stripe API versions moved it from the subscription to the subscription item. `stripe_current_period_end` is display-only precisely so that getting this wrong is cosmetic.
- How trial days are read off a Price object, and whether the dashboard exposes them on the Price at all. If it does not, the trial length has to move to a named env var, which is still not a hardcoded number but is a worse home for it.
- **That the Dispute object carries `charge` but no `customer`, and that the Charge object carries `customer` and `invoice`.** The charge-resolution path is built on that shape. If a Dispute does expose a customer, the extra retrieve is wasted but harmless; if a Charge does not, the resolution needs the invoice hop on every event rather than as a fallback.
- Whether `subscriptions.list({ customer, status: 'all' })` returns cancelled subscriptions, which decides what "exactly one" means for the bind action on a church that has re-subscribed.
- **That a completed Checkout Session carries `client_reference_id`, `customer` and `subscription`, and that a `mode: 'subscription'` session that completed always names a subscription.** The first two are what the new `checkout.session.completed` path resolves through. The last is *not* assumed: the `recorded`, church-row-untouched branch for a session with no `subscription` exists precisely because this could not be verified. If it turns out that branch is unreachable in practice, it costs one dead code path and no correctness.
- Checkout Session expiry semantics — the copy now renders `session.expires_at` rather than asserting a duration, so this is a display question and no longer a correctness one.
- The Billing Portal configuration model and whether cancellation can in fact be disabled.
- Stripe's webhook timeout and retry schedule.
- Whether Stripe Brazil's onboarding for BRL settlement requires a CNPJ, and what that implies for Rafael's entity.
- Whether the event type names are stable for the API version the SDK pins.

**No live database and no live deployment exist.** Nothing in this repository has ever executed against Neon; this subsystem's migration will be applied to PGlite in tests and to a real server for the first time in production. Vercel Cron has never run for this project, `CRON_SECRET` has never been injected, and the reconciliation route has never been called by anything but a test. Two consequences that are genuinely unknown:

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
| **C2 · Reconciliation not resumable** | **Fixed.** Added `ORDER BY stripe_sync_attempted_at ASC NULLS FIRST, id ASC`, an explicit `RECONCILE_BATCH` cap, `export const maxDuration = 60`, per-church `try`/`catch`, and partial-run reporting. This required a **seventh column**, `stripe_sync_attempted_at`, separate from `stripe_synced_at`: the cursor must advance on failure or a permanently broken church starves the queue head forever, while the staleness warning must *not* advance on failure or a broken church looks healthy. The attempt marker is written **before** the Stripe call and is the one deliberate two-statement path in the subsystem — justified because it carries no invariant. *Revision 2 also asserted an interlock with C1's fix; Revision 3 strikes that assertion as false — see below.* |
| **3 · Charge events have no resolution path** | **Fixed, and the reviewer's sketch corrected.** The review proposed `charge → charge.customer`. That is right for `charge.refunded`, whose payload *is* a Charge — but `charge.dispute.created` carries a **Dispute**, which has `charge` and `payment_intent` and no `customer` field, so it needs a charge retrieve first. Both paths, the `charge.invoice` fallback, the null case, and a new `recorded` outcome distinct from `applied` are now specified. The object-shape claim is added to the unverifiable list. |
| **4 · `mapStripeStatus` return type** | **Fixed.** Now a three-arm discriminated union (`map` / `hold` / `unknown`). Both no-op arms pass `NULL` to the same SQL and differ only in the recorded outcome. |
| **5 · Customer-only bind is invisible to reconciliation** | **Fixed twice over.** The bind action resolves the subscription and writes both ids or refuses (zero / multiple cases each get pt-BR copy), *and* reconciliation's candidate set widens to `subscription_id IS NOT NULL OR customer_id IS NOT NULL`, so the guarantee does not depend on the action being written correctly. |
| **6 · `stripe-client.ts` importable by anyone** | **Fixed, and extended.** Split into an owner-only general client and a church-safe `stripe-portal.ts`. But the review's fix is insufficient on its own: `resolveSpecifier` returns `null` for bare package specifiers (`tests/privilege-boundary.test.ts:53-59`), so church-facing code could `import Stripe from 'stripe'` and hold full capability while every assertion passed. Added a second rule restricting the raw `stripe` specifier to the owner zone plus the one church-safe module. Also fixed a latent hazard from the binding constraints: `walk()` skips `ALLOWED` (`:45`), so making `src/lib/billing-sync/` owner-only as a directory would make it invisible to *every* rule in the suite — the scan set and the exemption set are now separated. *Revision 3 finds this fix still incomplete and completes it — see below.* |
| **7 · `stripe_object_id` conflates customer and subscription** | **Fixed.** Three columns: `stripe_object_id` (audit, what the event was about), `stripe_customer_id` and `stripe_subscription_id` (resolution keys, what the UI and reconciler read). |
| **8 · Override label contradicts semantics** | **Fixed by changing the copy, not the semantics.** Freeze is the correct behaviour — forcing `active` would be a fourth status in disguise, which the constraints forbid. `Manter ativa independentemente do Stripe` is removed and replaced with `Congelar a situação atual (ignorar o Stripe)` plus explanatory copy stating the required ordering. Also resolved the ambiguity the review flagged: `setChurchStatus` deliberately does **not** consult the flag, so Rafael's manual control always wins; the rule is now stated as "Stripe events and reconciliation cannot write", never "nothing can write". |
| **9 · Missing dependency, unpinned `apiVersion`, missing script** | **Fixed.** `stripe` added to `dependencies`, `apiVersion` pinned explicitly with the reason, `"billing:reconcile"` script specified. |
| **10 · Hardcoded 24-hour expiry claim** | **Fixed.** Copy now renders `session.expires_at`: `Envie este link para a igreja. Ele expira em {data} às {hora}.` Checkout expiry moves from a correctness risk to a display detail. |
| **11 · `.env.example` "ONLY secret" line** | **Finding upheld; the previous draft was wrong and is corrected.** Verified: line 1 makes the claim, `SESSION_SECRET` and `BLOB_READ_WRITE_TOKEN` are below it. The claim is *already* false. The spec no longer says it "stops being true". |
| **12a · New billing block must satisfy `admin read guard`** | **Partly refuted, with evidence.** No new page is created. The block renders inside `src/app/admin/(protected)/configuracoes/page.tsx`, which already imports `requireReadableSession` on line 1 and calls it on line 9 — so the existing test passes unchanged and nothing joins `NO_CHURCH_DATA`. The spec now records that this was checked, and records that a separate `/admin/assinatura` route *would* have needed the guard, since the choice not to add a route is what avoids it. |
| **12b · Missing `stripe_event` indexes** | **Fixed.** `(church_id, received_at DESC)` and `(outcome)` added, each tied to the `/owner` query that needs it. |

**Not changed, and why.** The review's "Clean" section is accepted as-is: the re-fetch-don't-trust-the-payload decision, the weak-claim/re-process idempotency argument, the `ON DELETE SET NULL` exception, the single-event-family choice and the pt-BR string set all survive this revision untouched except where a finding above required the wording to move.

**Still genuinely undecidable without the owner or a live account.** `RECONCILE_BATCH` and the cron frequency cannot be chosen without measuring a real Stripe retrieve from a deployed function; the Dispute/Charge field shapes and `subscriptions.list` semantics for cancelled subscriptions need one real call each; and the four items the review already listed for the owner — trial-on-Price, card versus PIX acceptance, nota fiscal, and portal cancellation-disable — are unchanged by this revision. *(Two of those four are now decided; see Revision 3, which supersedes this sentence.)*

**Revision 3 — 2026-08-07.** The re-attack returned **"Needs revision — narrowly"**: every original Critical is structurally fixed and both refutations hold, but the revision that fixed them introduced four defects and left one residual. All five are closed here. Two owner decisions taken since Revision 2 are folded in. **No new machinery**, and that is deliberate: the re-attack exists because the previous pass introduced defects while closing findings. Three of the five fixes remove something outright — a special case, a false claim, a function parameter. A fourth replaces a three-entry roots list with one entry. Only the fifth adds anything at all, and what it adds is `attempts = attempts + 1` on the failure write — a write Revision 2 already implied ("the row left `outcome = 'failed'`") without ever writing it down as a statement.

| Finding | Disposition |
|---|---|
| **`checkout.session.completed` had no defined writer** | **Fixed by deleting the special case.** The row said "bind ids, no status change" while the same revision made the apply statement the sole writer of both ids — and apply always writes `status` when `$mapped` is non-null and always writes four mirror columns with no `COALESCE`. The two could not both be true. The event now runs **the ordinary apply**: resolve the church from `client_reference_id`, then `apply(churchId, session.subscription)`. No bind-only mode, no second statement, no new outcome. The mirror columns still need no `COALESCE`, and the reason is now stated as an invariant instead of left implicit: **`apply(churchId, subscriptionId)` takes two ids and does the retrieve itself**, so no caller can hand it a half-filled record — no caller hands it a record at all. The one branch with no `sub_…` to retrieve — a session whose `subscription` is null — does not call apply and is `recorded`, the same rule the two charge events already follow. |
| **The asserted C1↔C2 interlock was false** | **Struck, and not replaced with a softer version.** The claim was that under `WHERE billing_override = false` an overridden church "would never advance its cursor and would sort to the front of every run forever". The cursor is written by `UPDATE church SET stripe_sync_attempted_at = now() WHERE id = $1` — a different statement, carrying no override predicate — so the starvation cannot occur whatever shape apply has. The seventh column keeps the justification it already had on its own merits (health versus progress) and the two fixes are now stated as independent. The C2 row above is annotated rather than quietly rewritten, so the record shows the document made a claim it could not support. |
| **`src/app/assinatura/**` sat outside the privilege scan** | **Fixed at the root, not at the leaf.** Verified against source: `CHURCH_FACING_ROOTS` is `src/app/admin`, `src/app/api`, `src/lib` (`tests/privilege-boundary.test.ts:24-28`), and `src/app` today holds only `admin/`, `api/`, `owner/`, `layout.tsx` and `page.tsx` — so the two new public pages would have shipped unscanned by the owner-only rule, the new bare-`stripe` rule, and anything added later. Naming the two pages would fix one instance, so the scan root becomes `src/app` and the owner zone does the excluding. `scripts/` joins the scan set for the same reason, **and the spec now says plainly that `scripts/**` is also in the owner zone and therefore currently subject to no rule at all** — the Revision 2 entry implied a coverage that did not exist. The injected-violation drill gains a second pair, fired from `src/app/assinatura/obrigado/page.tsx`, because that is the pair that would have passed before. |
| **`attempts` documented per-attempt, incremented on completion** | **Fixed by adding the increment to the failure write, and by saying what the column means.** The failure path is now an explicit statement — `outcome = 'failed'`, `error`, `attempts = attempts + 1`, `processed_at` deliberately left null — so a poison event's count rises in the repair queue. The description now says what is true: the column counts runs that reached a conclusion, a run killed mid-flight cannot increment it, `processed_at IS NULL` is the pending signal and `attempts` is the diagnosis. Also recorded: there is **no dead-letter cap**, deliberately, because Stripe's retry schedule ends on its own and reconciliation never replays events. |
| **Residual: `stripe-portal.ts` importable by anyone, taking an arbitrary `cus_…`** | **Tightened, not excused.** The re-attack was right that narrowing the verbs leaves "which customer" as prose plus one test on the only call site that exists today. The parameter is deleted: `createPortalSession(returnUrl)` calls `requireReadableSession()` and `getChurchById(session.churchId)` inside the module and accepts **no tenant identifier at all**, so importing it grants exactly the capability the importer's own session already carries — which is what makes "may be imported by: anyone" honest rather than tolerated. Two costs are stated rather than left to be found: the module is request-scoped and can never serve `/owner`, the reconciler or the CLI; and `src/lib/billing/` now depends on `src/lib/auth/`. It stays testable through the existing session stub (`tests/session-guards.test.ts:36-43`). |

**Folded in from `.superpowers/sdd/owner-decisions-2026-08-07.md`.**

- **Card only — settled, no longer an open question.** Removed from the open list and stated as a binding constraint in the decisions table and at the head of the PIX/boleto section, with the consequence named: a card is a stored credential, so **automatic dunning is available**, and every "no human on either edge" claim in this document depends on that. The revisit trigger is the first church that refuses a card, and the mapping survives such a switch unchanged.
- **Nota fiscal — its own subsystem, its own spec.** Removed from this spec's open questions. What remains here is a one-line obligation: **make the subscription a reliable record of what was charged and when.** Stripe is the single source of truth for money, `stripe_subscription_id` is unique per church, `stripe_event` survives the church being deleted, and there is no mirrored `amount` to disagree with Stripe — all four already hold, so nothing is added to this design to serve it.

**Also folded in from the re-attack's optional list.** The bind action's "exactly one" branch drops its pre-write of the two ids and hands that subscription's id straight to `apply`, which writes both itself — one fewer statement and one fewer half-committed window.

**Deliberately not done, and why.** The re-attack suggested filling `church_id` and `stripe_customer_id` on `stripe_event` at *claim* time rather than at completion, to close the crash-between-apply-and-close case. Not taken: at claim time the church is not yet resolved, and for the charge events resolving it requires the very Stripe call that would have crashed — so the fix would either move the same window or need a transaction neon-http does not have. The gap is instead written into the failure-mode table in full, including its one real consequence: an already-applied `charge.dispute.created` whose closing write was lost never appears in that church's **Últimos eventos** list. It is the one durable gap in the event trail.

**Still genuinely open, and now shorter.**

- Whether trial length can be read off the Stripe Price object, or must become a named env var. *(Owner + one live call.)*
- Confirming the Billing Portal can have cancellation disabled. If it cannot, the church-panel button is a self-service off switch and must not ship. *(Owner + one live account; a launch prerequisite, not a nicety.)*
- Whether `incomplete_expired` should keep mapping to `hold` or move to `suspended`. It is a terminal Stripe status that currently leaves a never-charged church `active` indefinitely with a silent drift report; the `/owner` card shows the divergence, and whether that is a sufficient detector is a product judgement. *(Owner. New on this list — surfaced by the re-attack, not resolved by it.)*
- `RECONCILE_BATCH` and cron frequency, which need a measured Stripe retrieve from a deployed function.
- The Dispute/Charge object shapes and `subscriptions.list({ status: 'all' })` semantics for cancelled subscriptions — one real API call each.
