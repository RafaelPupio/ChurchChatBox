# Launch Roadmap

Where we are: **bot core + admin Plan A both merged to `main`; the gate is a live Neon DB**. The step-by-step, who-does-what version of what's left is [[Launch Checklist]].

| # | Stage | Status |
|---|---|---|
| 1 | Requirements + design approved | ✅ done (2026-07-15) |
| 2 | Bot core plan + implementation | ✅ merged to `main` (PR #1) |
| 3 | Admin panel **Plan A** (login + Conteúdo + Configurações) | ✅ merged to `main` (PR #3), 113 tests |
| 4 | **Create Neon DB → migrate + seed → create-admin** | 🔜 **next — needs Rafael** |
| 5 | Test end-to-end on Meta's **free test number** | ⬜ needs Meta account |
| 6 | Admin panel **Plan B** (Caixa de Entrada + Pedidos de Oração) | ⬜ separate plan, later |
| 7 | Meta business verification + real chip connected | ⬜ |
| 8 | Fill real content → announce the number to members | ⬜ |

## ⚠️ What is written but has never executed
Both the bot core and the admin panel are code-complete, and the **pure** logic is well covered (113 tests: router, payload builders, signature verification, inbound parser, mode reversion, password hashing, session guard, menu rules, validation). But by an explicit decision to defer live verification, **nothing DB/HTTP/browser-backed has ever run**:

- the **schema has never been applied** to a real Postgres; the **seed has never run**;
- **no repository query has ever executed** (bot or panel);
- the **webhook POST path has never handled a real Meta callback**;
- **nobody has ever logged into the panel**, no Server Action has run, no image has uploaded.

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
