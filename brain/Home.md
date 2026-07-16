# ⛪💬 Secretária Virtual Brain

The project's second brain. **Start here.** Every note is small on purpose — read only what the task needs.

## Quick status
- **Stage:** bot core (`feat/bot-core`, PR #1) **and** admin panel Plan A (`feat/admin-panel`) both **code-complete** — 113 tests green — see [[Launch Roadmap]]
- **What it is:** a WhatsApp automated secretary for a church, answering in **Brazilian Portuguese** from a dedicated church number, with a pt-BR admin panel where staff edit everything the bot says
- **Next milestone:** Rafael creates a free Neon database → migrate + seed + create-admin → log into the panel → test the bot on Meta's free test number
- **⚠️ Never executed:** schema, seed, all repos, the webhook POST path, and the entire admin panel (login, actions, pages, image upload) have never touched a real database, Meta callback, or browser. The first real run is the test.
- **Cost target:** R$ 0/month (Vercel + Neon + Blob free tiers; Meta is free for user-initiated chats)

## Map of content
### Project
- [[Overview]] — what this is, who it's for, the one-church-now/product-later shape
- [[Launch Roadmap]] — the stages and where we are
- [[Decisions Log]] — every big choice and *why*

### Architecture
- [[App Structure]] — the one Next.js app, its modules and boundaries
- [[Data Model]] — tables, and why the menu is data instead of code
- [[Bot Flow]] — what the bot says and when, message by message

### Operations
- [[Launch Checklist]] — every step from code-complete to live, marked by who does it
- [[Meta WhatsApp Setup]] — the Cloud API bureaucracy, in order
- [[Hosting & Deploy]] — Vercel + Neon + Blob, and the free-tier fine print
- [[Troubleshooting]] — every gremlin we meet and its fix

### Product
- [[Menu Inventory]] — the 9 menu rows and the 10-row ceiling
- [[Backlog]] — the longer wishlist

### Learning
- [[Concepts Explained]] — plain-language explanations of the tech

## The one rule that shapes everything
**Nothing user-facing is hardcoded.** Every Portuguese string the bot can say — and the menu structure itself — lives in the database and is editable in the admin panel. Portuguese defaults ship as *seed rows*, not constants. If you find yourself typing a Portuguese string into a code path that reaches a member, stop: it belongs in `church` or `menu_item`. See [[Data Model]].

## Conventions
- Notes are **evergreen**: update in place, don't append forever.
- New decision? Add a line to [[Decisions Log]].
- New gotcha? Add it to [[Troubleshooting]] the day it happens.
- The brain is in English; the *product* is in Portuguese. Don't mix them up.
- Source of truth for the full design: [[Overview]] links the committed spec.
