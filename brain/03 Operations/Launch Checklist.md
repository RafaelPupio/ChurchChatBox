# Launch Checklist

The step-by-step path from code-complete to live, in order, marked by **who does each step**. The strategic "where are we" view is [[Launch Roadmap]]; this is the actionable companion.

Interactive version (the checkboxes remember what you've ticked): https://claude.ai/code/artifact/ec8a5cfa-ef89-46ec-921d-8db77e82791b

## The one rule
**Everything waits on Neon.** Until the database exists, nothing past "built & merged" can be verified — the schema, seed, repos, actions, and pages have only ever typechecked, never run. The first real run is the real test. See [[Launch Roadmap]] for the full "never executed" list.

## Owners
- 🧑 **Rafael** — accounts, money, decisions, credentials. I can't create accounts or enter secrets for you.
- 🤖 **Me** — commands, wiring, verification.

## Phases

**0 · Built & merged** ✅ — bot core, admin panel and the multi-church conversion all on `main` (PR #9), 212 tests. Pure logic and PGlite only; nothing DB/HTTP/browser-backed has run.

**1 · Database — Neon** — *the gate.* 🧑 create a free neon.tech project + copy the connection string · 🤖 `.env` → `npm run db:migrate` (applies `0000`–`0003`, none of which has ever touched a real Postgres server) → `npm run create-owner`. Then provision church #1 **from `/owner`**, not from the seed script — `npm run db:seed` is a local dev fixture and refuses to run in production. First real execution of the schema and repos. See [[Hosting & Deploy]] and [[Multi-Tenancy]].

**2 · Prove it runs locally** — 🤖 `npm run dev`, log into `/admin`, exercise every screen (edit texts, add/reorder/hide items, upload an image, add staff) against real Postgres · 🧑 read the pt-BR wording and flag changes.

**3 · Meta WhatsApp** — *the long pole (⧗ start now).* 🧑 Business account + WhatsApp app, **start business verification** (days; CNPJ helps), buy a **new chip** · 🤖 wire credentials + webhook + verify token, subscribe to *messages*. See [[Meta WhatsApp Setup]].

**4 · Drive the bot** (Meta's free test number) — 🤖 walk greeting → menu → content → calendar image → prayer → handoff, plus a resend to prove deduplication · 🧑 confirm the tone on your phone. See [[Bot Flow]].

**5 · Deploy — Vercel** — 🧑 project + connect the repo + Neon/Blob integrations · 🤖 env (a **real random** `SESSION_SECRET`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`), deploy, point Meta's webhook at the live URL. See [[Hosting & Deploy]].

**6 · Real content** — 🧑 real horários, endereço, PIX, this month's calendar image, OTB Jovens & GD Adultos info — all in the panel (the whole point of it). Keep the menu button label ≤ 20 chars.

**7 · Launch** — 🧑 connect the real chip, final walk-through from your own phone, announce the "secretária virtual" number to members.

**8 · After launch** — Stripe billing, then the nota fiscal integration (a *launch dependency* for any church with a CNPJ — see [[Decisions Log]]), then LGPD Art. 18 tooling. All three are specced; none is built.

## Three things that bite
- **The new chip is one-way** — a Cloud API number stops working in the normal WhatsApp app forever, so it is never the church's existing line. See [[Meta WhatsApp Setup]].
- **Meta verification is slow** — days, sometimes with a document request. Start it in parallel with Neon, not after.
- **`SESSION_SECRET` in production must be a real random 32+ char string**, never the `.env.example` placeholder — the placeholder is ≥32 chars so it won't trip the length guard, but it's a known, forgeable key.

Also watch the menu button ≤ 20 chars and the empty-content-item rule — see [[Troubleshooting]].

Cost holds at **R$ 0/month** throughout — see [[Hosting & Deploy]].

---

## Onboarding church #2 (and every one after)

Once the platform is live, adding a church is a form, not a deploy. See [[Multi-Tenancy]] for why it works this way.

1. 🧑 **The church buys a new chip.** A number bound to the Cloud API stops working in the WhatsApp app *forever* and its history does not migrate — never their existing number.
2. 🧑 **Add the number in Meta Business** under your app, and complete verification for that number.
3. 🤖 **`/owner` → "Nova igreja"** — name, admin e-mail, temporary password. This creates the church, its first admin, and the 🔒 Privacidade menu item in one step.
4. 🤖 **`/owner/<church>` → credentials** — paste `phone_number_id`, access token, app secret, and a **unique** webhook verify token. Both `phone_number_id` and the verify token carry unique indexes; reusing another church's will fail loudly, which is the point.
5. 🧑 **Point Meta's webhook** at the same `/api/whatsapp/webhook` URL as every other church, using that church's verify token. One endpoint serves all of them; routing is by `phone_number_id`.
6. 🧑 **Church staff log in** at `/admin`, change the temporary password, and fill in their own content. They never see credentials — only a read-only "Conectado" indicator.
7. 🤖 **Send one test message** to the new number and confirm the reply, then confirm nothing landed in any other church's inbox.

**Watch the "Conectado" indicator.** It goes green on `phone_number_id` + access token + app secret. All three are required: without the app secret the webhook drops every inbound message, so a church could otherwise show green while auto-replies were silently dead.

## First live checks, in this order

Everything below has only ever run against PGlite. These are the three things most likely to be wrong on contact with reality:

1. **Two churches, two numbers, one webhook.** Message church A's number. Confirm nothing appears in B's inbox, and that a body signed with B's app secret is *rejected* for A. `findChurchByPhoneNumberId` plus the signature check is the entire tenant router and it has never run.
2. **Suspend a live church from `/owner`.** A member sends a message → the message row appears and `last_inbound_at` updates → **nothing** is sent, including the error apology. Reactivate and confirm the 24h reply window is still accurate and the contact sits in the right place in the inbox.
3. **Force a provisioning failure.** Revoke insert on `menu_item` for one attempt and provision a church. It should survive with its admin, report `menuSeeded: false`, and be repairable from the owner console — not wedge the e-mail address.

Also on day one: confirm the 8-hour session `ttl` actually expires a cookie (verified by reading code only), and that a Blob image upload mints a token and completes.
