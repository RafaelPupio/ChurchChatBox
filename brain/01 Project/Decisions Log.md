# Decisions Log

One line per decision, newest last. Format: **what** — *why*.

- **WhatsApp church secretary, pt-BR only** (Rafael, 2026-07-15) — the members are Brazilian; the bot and the *entire admin panel* are in Portuguese. Code identifiers stay English.
- **One church now, architected for multi-church later** — every table carries `church_id` from day one, so onboarding church #2 is a row, not a rewrite. The onboarding UI is deferred.
- **Menu-only, no AI** — predictable, zero AI cost, and sufficient for informational needs. Revisit only if members keep typing questions the menu can't answer.
- **Official Meta Cloud API over Baileys or a Brazilian gateway** — free for user-initiated conversations, no ban risk, and the only sane base for a product. Baileys violates WhatsApp's terms and can get a church's number banned; gateways add ~R$100/mo per church and a middleman.
- **A new dedicated chip, not the church's existing number** — a number bound to the Cloud API **stops working in the WhatsApp app forever** and chat history doesn't migrate. The church's current number keeps working untouched; the bot gets its own.
- **Web admin panel over config file / Sheets / WhatsApp commands** (Rafael, 2026-07-15) — non-technical staff must be self-sufficient. Costs more to build; that's accepted.
- **Menu structure is data, not code** — staff add, edit, reorder, and hide items themselves. This is what "customisable" actually means; a hardcoded menu would need a developer for every new group.
- **Nothing user-facing is hardcoded** (Rafael, 2026-07-15, emphasised) — greeting, prompts, fallback, error text, even the "Ver opções" button label live in the DB. Portuguese defaults are *seed rows*, not constants. See [[Data Model]].
- **Human handoff via an inbox in the panel, not a redirect** — a Cloud API number can't be used in the WhatsApp app, so staff couldn't just pick up the phone. The inbox keeps the conversation on the church number instead of bouncing the member to a second chat.
- **Bot goes fully silent in `human` mode**, with auto-revert after 24h of staff inactivity — nothing is worse than a bot interrupting a real pastoral conversation, except a member stranded in permanent silence.
- **Vercel + Neon + Vercel Blob, all free tiers** (Rafael asked for a free option) — R$ 0/month, no server admin, and **no cold-start sleep** (which ruled out Render's free tier: a 30–60s wake would hit exactly the late-night messages this bot exists to answer). Oracle's free VPS was the alternative but costs sysadmin time.
- **Ofertas only — no dízimos** (Rafael, 2026-07-15) — the menu item is "💚 Ofertas" and its text speaks of ofertas/contribuições with the PIX key. No mention of dízimo anywhere.
- **Always return HTTP 200 to Meta, then process** — a non-200 makes Meta retry, and retries mean *duplicate replies to a real person*. Correctness here is about people, not status codes. See [[Troubleshooting]].
- **Native WhatsApp interactive list, with a numbered-text fallback** — tappable is better UX; both are built from the same `menu_item` rows so they can't drift apart.
- **This brain lives in the repo** — versioned, greppable, saves rediscovery tokens each session. Same pattern as BibleMarathon and TraderBot.
- **Repo is private** (2026-07-15) — matches every other personal project, and this one will eventually hold PIX details and Meta credential config.
