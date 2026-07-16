# Launch Roadmap

Where we are: **stage 2 of 9**. Design is approved; no code exists yet.

| # | Stage | Status |
|---|---|---|
| 1 | Requirements + design approved | ✅ done (2026-07-15) |
| 2 | Implementation plan written | ✅ done |
| 3 | Scaffold + schema + seed written | ✅ code done, **never run** |
| 4 | Menu router + webhook (the bot's brain) | ✅ done — 84 tests |
| 5 | **Create Neon DB → migrate + seed** | 🔜 **next — needs Rafael** |
| 6 | Test end-to-end on Meta's **free test number** | ⬜ needs Meta account |
| 7 | Admin panel: Conteúdo + Configurações | ⬜ separate plan |
| 8 | Admin panel: Caixa de Entrada + Pedidos de Oração | ⬜ separate plan |
| 9 | Meta business verification + real chip connected | ⬜ |
| 10 | Fill real content → announce the number to members | ⬜ |

## ⚠️ What is written but has never executed
The bot core is code-complete and its **pure** logic is well covered (84 tests: router, payload builders, signature verification, inbound parser, mode reversion). But by an explicit decision to defer live verification:

- the **schema has never been applied** to a real Postgres,
- the **seed has never run** (its idempotency and recovery are unverified),
- **no repository query has ever executed**,
- the **webhook POST path has never handled a real Meta callback**.

Nothing downstream will catch a mistake in that code before it reaches a real church. The first real run is the test. See [[Troubleshooting]] for what to watch, in order.

## The two things that gate a real launch
- **Meta business verification** can take **days** and may ask for documents (CNPJ helps). It's slow and outside our control, so start it early — ideally in parallel with stage 3, not at stage 8. See [[Meta WhatsApp Setup]].
- **A new chip** must be bought for the bot. Never convert the church's existing number — see [[Decisions Log]].

## Sequencing note
Stages 4–6 can be built and tested entirely against Meta's free test number. **No real number is needed until stage 8**, so bureaucracy never blocks coding.
