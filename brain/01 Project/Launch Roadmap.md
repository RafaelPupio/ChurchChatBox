# Launch Roadmap

Where we are: **the product is code-complete as a multi-church SaaS; the gate is still a live Neon DB**. The step-by-step, who-does-what version of what's left is [[Launch Checklist]].

| # | Stage | Status |
|---|---|---|
| 1 | Requirements + design approved | ✅ done (2026-07-15) |
| 2 | Bot core plan + implementation | ✅ merged to `main` (PR #1) |
| 3 | Admin panel **Plan A** (login + Conteúdo + Configurações) | ✅ merged to `main` (PR #3), 113 tests |
| 4 | Admin panel **Plan B** (Caixa de Entrada + Pedidos de Oração) | ✅ merged to `main` (PRs #5, #6), 123 tests |
| 5 | Multi-church SaaS design spec | ✅ merged to `main` (PR #7) |
| 6 | **Multi-tenant conversion** — provisioning, owner console, isolation, suspension | ✅ merged to `main` (PR #9) |
| 6b | Suspension records what it cannot send; greeting survives a failed send | ✅ merged to `main`, 212 tests |
| 7 | **Create Neon DB → migrate → create-owner → provision church #1** | 🔜 **next — needs Rafael** |
| 8 | Test end-to-end on Meta's **free test number** | ⬜ needs Meta account |
| 9 | Meta business verification + real chip connected | ⬜ |
| 10 | Fill real content → announce the number to members | ⬜ |
| 11 | **Stripe billing** — card-only, drives `past_due` automatically | ✅ spec ready to plan |
| 12 | **Nota fiscal integration** — a launch dependency, not a nicety | ✅ spec ready to plan, 4 homologação experiments first |
| 13 | **LGPD data-subject tooling** — access, export, deletion, 12-month purge (Art. 18) | ✅ spec ready to plan |

## ⚠️ What is written but has never executed
The whole product — bot, panel, and owner console — is code-complete, and coverage is now genuinely good: **212 tests**, including tenant isolation, repo scoping, provisioning failure paths, the privilege boundary, and the webhook's suspension behaviour. Crucially, those run on **PGlite — real Postgres in WASM, with the real migrations applied** — so the schema and SQL semantics *are* exercised. That is a real step up from pure-logic-only.

But by an explicit decision to defer live verification, **nothing has run against a real server, Meta, or a browser**:

- the migrations have **never been applied to a real Postgres server** (only to PGlite);
- **no repository query has executed against Neon**;
- the **webhook POST path has never handled a real Meta callback** — the tenant router (`phone_number_id` → church → that church's app secret) is the single most important untested path;
- **nobody has ever logged into the panel or the owner console**, no Server Action has run in a real request, no image has uploaded;
- session cookies have never been sealed or unsealed by iron-session in a real request, so the 8-hour `ttl` is inspection-only.

Nothing downstream will catch a mistake in that code before it reaches a real church. The first real run is the test. See [[Troubleshooting]] for what to watch, in order.

## First real-run sequence (when Neon exists)
1. Create a free Neon project → `DATABASE_URL` in `.env` → `npm run db:migrate && npm run db:seed`.
2. `npm run create-admin -- you@church.org <senha> "Seu Nome"` → the first panel login.
3. `npm run dev` → log in at `/admin`, edit content, **check the menu button label stays ≤ 20 chars** (see [[Troubleshooting]]).
4. Then connect Meta's free test number and walk the bot end to end.

## The two things that gate a real launch
- **Meta business verification** can take **days** and may ask for documents (CNPJ helps). It's slow and outside our control, so start it early — ideally in parallel with stage 3, not at stage 8. See [[Meta WhatsApp Setup]].
- **A new chip** must be bought for the bot. Never convert the church's existing number — see [[Decisions Log]].

## Sequencing note
Stages 4–6 can be built and tested entirely against Meta's free test number. **No real number is needed until stage 8**, so bureaucracy never blocks coding.
