# Secretária Virtual — Multi-Church SaaS

**Design doc** · 2026-08-06 · Status: approved

## Overview

Turn the existing single-church WhatsApp secretary into a product Rafael can sell to many churches. Each church configures what its bot says through the panel; none of them ever receives the code. Rafael hosts every WhatsApp number, bills through Stripe, and operates the platform from a separate owner console.

**The code never leaves.** This is hosted software: churches get a login URL, not a repository, a build, or a file. Protecting "the essence of the project" is a property of the deployment model, not something that needs building. The repository stays private.

### What already works

The architecture anticipated this from day one — the original spec's "one church now, product later" decision. Verified, not assumed:

- **All five child tables carry `church_id`** (`menu_item`, `contact`, `message`, `prayer_request`, `admin_user`).
- **The webhook already routes by tenant** — it resolves the church from the inbound `phone_number_id`, so two churches on two numbers already work.
- **Login already resolves tenant** — email → `admin_user` row → `churchId` into the session; `churchId` is never taken from client input.
- **Cross-tenant isolation holds under attack.** A two-church suite run against a real Postgres engine scored **16/16**: every list returned only the caller's church, `loadConversation(A, B.contactId)` returned nothing, and attempts to edit B's menu item, flip B's contact mode, mark B's prayer, or delete B's admin all changed **zero rows**, leaving B byte-identical.

### The actual gaps

1. `getChurchRecord()` selects "the single church row" (`limit(1)`).
2. `db:seed` refuses to run if any church already exists — it cannot create church #2.
3. No signup, no billing, no owner console, no LGPD tooling.

### Decisions taken (and why)

| Decision | Choice | Reason |
|---|---|---|
| Tenancy | Shared database, row-level by `church_id` | LGPD is risk-based (Art. 46), not prescriptive about architecture; logical segregation with enforced access control is accepted. Already built and verified 16/16. |
| Isolation evidence | Automated cross-tenant tests in CI | Art. 6's accountability principle requires *demonstrating* controls work. "We reviewed the queries" is not evidence; a passing suite is. |
| Postgres RLS | Deferred, documented | Stronger (database-enforced), but needs per-request session context, which the `neon-http` driver cannot do — it has no transactions. Adopting RLS means a driver migration. Not worth blocking the first sale. |
| WhatsApp numbers | Rafael hosts all of them | Meta's onboarding defeats most churches. Rafael does the setup; the church buys a chip. Also means he can disconnect a non-paying church. |
| Billing | Stripe subscriptions | Automated, supports BRL and Pix in Brazil. |
| Signup | Self-serve + Stripe Checkout, WhatsApp connected afterwards | The church is invested before Rafael spends setup effort, and can write content while he handles Meta. |
| Trial | None — pay at signup | Only serious buyers consume Meta setup effort. States reduce to `active` / `past_due` / `suspended`. |
| Payment lapse | 7-day grace, then bot quiet + panel read-only, data kept | Never drop members into sudden silence over an expired card; never delete a church's data over billing. |
| Grace enforcement | Computed on read, no cron | A pure `effectiveStatus()` mirrors the existing `effectiveMode()` pattern. No scheduler to fail silently. |
| Owner console | Separate `owner_user` table + separate `/owner` login | `admin_user.church_id` is `NOT NULL`; an owner belongs to no church. A role flag would force either a nullable column or a fake "platform" church. Isolation becomes structural, not a boolean. |
| WhatsApp credentials | Owner-only; churches see read-only status | Churches can't break their own connection. They still see "Conectado ✓" / "Aguardando conexão" for support. |
| New church's menu | Blank, except a seeded Privacidade item | Church-specific items (OTB Jovens, GD Adultos) don't generalise. Privacy is the exception — a compliance mechanism, not content. |
| LGPD | Built in now | Cheap while `church_id` scoping makes export/delete a scoped query and a cascade; painful to retrofit once real members' data is in the system. |
| Language | pt-BR everywhere user-facing; i18n later | Code identifiers and comments stay English. |

## Architecture

No new tenancy machinery — `church_id` already is the tenancy. What changes:

### Data model

**`church` gains a lifecycle:**
- `status` — enum `active` | `past_due` | `suspended`
- `stripe_customer_id`, `stripe_subscription_id` — nullable
- `grace_until` — nullable timestamp, set when payment fails

**New table `owner_user`:** `id`, `email` (unique), `password_hash`, `name`, `created_at`. Deliberately **no `church_id`** — an owner belongs to no church.

Everything else is unchanged.

### Provisioning replaces seeding

One reusable function replaces both single-church scripts:

```
provisionChurch(name, adminEmail, password) → { churchId, adminUserId }
```

It creates the church row (`status: 'active'`), its first `admin_user`, and exactly one menu item — **🔒 Privacidade**. Signup calls it. `db:seed` and `create-admin` become thin wrappers so existing local setup keeps working. `getChurchRecord()` is removed; every caller already has a `churchId` from the session.

### Suspension

`effectiveStatus(status, graceUntil, now)` — pure, tested, no I/O:
- `past_due` with `grace_until` in the future → reads as `past_due` (bot runs, panel warns)
- `past_due` past `grace_until` → reads as `suspended`
- otherwise → the stored status

Two consumers:
- **Webhook:** on `suspended`, record the inbound message but send nothing. Data keeps accumulating so nothing is lost when they pay.
- **Panel:** on `suspended`, content renders read-only; every mutating action refuses with a pt-BR explanation.

## Signup and billing

**Signup** (`/cadastro`, public): church name, admin email, password → Stripe Checkout → on success `provisionChurch()` runs and the admin lands in the panel. Configurações shows *"Aguardando conexão"* until Rafael connects the number.

**Stripe webhook** (`/api/stripe/webhook`), signature-verified with `STRIPE_WEBHOOK_SECRET`, same discipline as the WhatsApp webhook — always acknowledge, never let an exception escape:

| Event | Effect |
|---|---|
| `checkout.session.completed` | `status = active`, store customer + subscription ids |
| `invoice.payment_failed` | `status = past_due`, `grace_until = now + 7 days` |
| `invoice.paid` | `status = active`, clear `grace_until` |
| `customer.subscription.deleted` | `status = suspended` |

## Owner console

`/owner`, its own login backed by `owner_user`, its own session. A church admin cannot reach it — the guard requires an owner session, which church login never issues.

- **Church list:** name, status, WhatsApp connected, active menu-item count, last activity.
- **Per church:** set/update WhatsApp credentials (`phone_number_id`, `access_token`, `app_secret`); suspend/reactivate manually; export data; delete.
- **A warning before going live:** a church with zero active menu items greets members and offers nothing. The empty-menu guard makes this degrade gracefully (plain greeting text, not a Graph API error), but the console flags it.

## LGPD

Members' phone numbers and prayer requests reveal **religious conviction, which Art. 5, II lists explicitly as *sensitive* personal data** — the highest-protection category. Each church is the **controlador**; Rafael is the **operador**, jointly liable under Art. 42 if he processes outside their lawful instructions.

**Mechanisms built:**

- **Transparency (Art. 9)** — every church's bot is seeded with a **🔒 Privacidade** item stating *"Seus dados são tratados de acordo com a LGPD (Lei nº 13.709/2018)"* followed by what is collected (phone, messages, prayer requests), why, how long it is kept, and how to request access or deletion. Editable per church.
  - The bot states data is *handled in accordance with* LGPD — a statement about practice. It does **not** claim "this app is compliant," which is a legal representation software cannot guarantee and which depends on facts outside the code.
- **Data-subject requests (Art. 18)** — a member asking for deletion lands in the panel as an actionable item, the same way prayer requests do. A right that exists only in a policy document is not a right.
- **Export (Art. 18)** — owner console produces one JSON file per church: church row, menu, contacts, messages, prayer requests.
- **Hard delete (Art. 18/16)** — deleting the church row cascades to every child table. Verified: deleting church A removed all of A and left B whole.
- **Retention (Art. 6, necessity)** — messages are purged after **12 months** by default, via a documented purge the owner console can run per church. Prayer requests are exempt from the automatic purge (a church may want to keep its prayer history) but are covered by export and delete. `message` otherwise grows forever, and indefinite retention of members' conversations is hard to justify under the necessity principle. The 12-month default is a starting point for the lawyer review, not a legal determination.
- **Accountability (Art. 6, VIII)** — the cross-tenant isolation suite runs on every commit as demonstrable evidence.
- **Processing agreement** — a clause in the terms establishing controlador/operador roles and permitted processing.

**Not legal advice.** These are engineering mechanisms informed by the statute. A Brazilian lawyer must review the terms, the processing agreement, and the **legal basis** each church relies on to message members, before money changes hands. Note also that ANPD's simplified regime for small processing agents may apply to individual churches — a question for that lawyer, not for this document.

## Testing

- **Cross-tenant isolation** — the two-church attack suite, permanent and in CI. Reads, writes, webhook routing, and cascade delete.
- **Pure functions** — `effectiveStatus()` boundary tests (inside grace, exactly at expiry, past expiry, null), matching the existing reply-window and contact-mode test style.
- **Stripe webhook** — integration tests with signed fixture payloads and signature rejection. Never live Stripe.
- **Provisioning** — two consecutive `provisionChurch()` calls produce two independent churches, each with its own admin and its own Privacidade item.

## Build order

Four subsystems, sequenced by what unblocks revenue. Each gets its own plan and review cycle.

1. **Multi-tenant provisioning** — `provisionChurch()`, remove single-church assumptions, isolation suite in CI. Nothing else works without it.
2. **Owner console** — `owner_user`, `/owner` login, church list, credential management, suspend/reactivate. This is what makes onboarding church #2 possible.
3. **Stripe + lifecycle** — signup, Checkout, webhook, `effectiveStatus()`, suspension gating.
4. **LGPD tooling** — export, delete, retention, data-request handling.

**Recommendation: build 1 and 2, then stop and reassess.** That combination lets Rafael onboard a second church and invoice manually while learning whether churches actually want this. Stripe automates billing he may only need three times.

## Non-goals

- **Postgres RLS** — documented as the eventual stronger control; requires migrating off `neon-http`.
- **Panel i18n** — the *bot's* strings are already per-church database rows, so a church could write in any language today. Only the **panel chrome** is hardcoded pt-BR, and that is the scope of future multi-language work.
- **Self-serve WhatsApp onboarding** — churches never touch Meta.
- **Per-church custom domains, white-labelling, usage analytics.**

## Prerequisite worth naming

Every part of this sits on code that has **never run against Neon, Meta, or a browser**. The single church should be live and answering real members before the machinery to sell to fifty is built. See `brain/03 Operations/Launch Checklist.md`.
