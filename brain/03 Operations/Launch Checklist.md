# Launch Checklist

The step-by-step path from code-complete to live, in order, marked by **who does each step**. The strategic "where are we" view is [[Launch Roadmap]]; this is the actionable companion.

Interactive version (the checkboxes remember what you've ticked): https://claude.ai/code/artifact/ec8a5cfa-ef89-46ec-921d-8db77e82791b

## The one rule
**Everything waits on Neon.** Until the database exists, nothing past "built & merged" can be verified — the schema, seed, repos, actions, and pages have only ever typechecked, never run. The first real run is the real test. See [[Launch Roadmap]] for the full "never executed" list.

## Owners
- 🧑 **Rafael** — accounts, money, decisions, credentials. I can't create accounts or enter secrets for you.
- 🤖 **Me** — commands, wiring, verification.

## Phases

**0 · Built & merged** ✅ — bot core + admin panel (Plan A) on `main`, 113 tests. Pure logic only; nothing DB/HTTP/browser-backed has run.

**1 · Database — Neon** — *the gate.* 🧑 create a free neon.tech project + copy the connection string · 🤖 `.env` → `npm run db:migrate` → `npm run db:seed` → `npm run create-admin`. First real execution of the schema, seed, and repos. See [[Hosting & Deploy]].

**2 · Prove it runs locally** — 🤖 `npm run dev`, log into `/admin`, exercise every screen (edit texts, add/reorder/hide items, upload an image, add staff) against real Postgres · 🧑 read the pt-BR wording and flag changes.

**3 · Meta WhatsApp** — *the long pole (⧗ start now).* 🧑 Business account + WhatsApp app, **start business verification** (days; CNPJ helps), buy a **new chip** · 🤖 wire credentials + webhook + verify token, subscribe to *messages*. See [[Meta WhatsApp Setup]].

**4 · Drive the bot** (Meta's free test number) — 🤖 walk greeting → menu → content → calendar image → prayer → handoff, plus a resend to prove deduplication · 🧑 confirm the tone on your phone. See [[Bot Flow]].

**5 · Deploy — Vercel** — 🧑 project + connect the repo + Neon/Blob integrations · 🤖 env (a **real random** `SESSION_SECRET`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`), deploy, point Meta's webhook at the live URL. See [[Hosting & Deploy]].

**6 · Real content** — 🧑 real horários, endereço, PIX, this month's calendar image, OTB Jovens & GD Adultos info — all in the panel (the whole point of it). Keep the menu button label ≤ 20 chars.

**7 · Launch** — 🧑 connect the real chip, final walk-through from your own phone, announce the "secretária virtual" number to members.

**8 · Plan B (deferred)** — Caixa de Entrada + Pedidos de Oração, so staff answer handoffs and read prayer requests in the panel instead of via SQL. Safe to defer — see [[Decisions Log]] and [[Backlog]].

## Three things that bite
- **The new chip is one-way** — a Cloud API number stops working in the normal WhatsApp app forever, so it is never the church's existing line. See [[Meta WhatsApp Setup]].
- **Meta verification is slow** — days, sometimes with a document request. Start it in parallel with Neon, not after.
- **`SESSION_SECRET` in production must be a real random 32+ char string**, never the `.env.example` placeholder — the placeholder is ≥32 chars so it won't trip the length guard, but it's a known, forgeable key.

Also watch the menu button ≤ 20 chars and the empty-content-item rule — see [[Troubleshooting]].

Cost holds at **R$ 0/month** throughout — see [[Hosting & Deploy]].
