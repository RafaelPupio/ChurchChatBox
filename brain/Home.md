# ⛪💬 Secretária Virtual Brain

The project's second brain. **Start here.** Every note is small on purpose — read only what the task needs.

## Quick status
- **Stage:** everything is merged to `main` — bot core, admin panel, and the multi-church SaaS conversion (PR #9) — **212 tests green**. Stripe billing, nota fiscal and LGPD tooling are **specced and ready to plan**, none built. See [[Launch Roadmap]]
- **What it is:** a WhatsApp automated secretary **sold to churches**, answering in **Brazilian Portuguese** from each church's own number, with a pt-BR panel where staff edit everything the bot says — and a separate vendor console at `/owner` where Rafael provisions churches, holds their Meta credentials, and suspends non-payers. See [[Multi-Tenancy]].
- **Next milestone:** Rafael creates a Meta app + test number → the bot's first *successful* outbound message. Everything inbound already works against live Neon.
- **✅ Running against real infrastructure** (2026-08-08): migrations applied to Neon, a church provisioned, both consoles driven in a browser, the privilege boundary verified live, and the webhook exercised end-to-end — forged signatures rejected, tenant routing correct, dedupe holding. **What has never succeeded once: an outbound message.** That needs a Meta app. Full breakdown in [[Whats Left]].
- **Cost target:** R$ 0/month at this scale (Vercel + Neon + Blob free tiers; Meta is free for user-initiated chats)

## Map of content
### Project
- [[Overview]] — what this is, who it's for, the one-church-now/product-later shape
- [[Launch Roadmap]] — the stages and where we are
- [[Whats Left]] — the honest gap list: proven vs. written vs. not built at all
- [[Decisions Log]] — every big choice and *why*

### Architecture
- [[App Structure]] — the one Next.js app, its modules and boundaries
- [[Data Model]] — tables, and why the menu is data instead of code
- [[Bot Flow]] — what the bot says and when, message by message
- [[Multi-Tenancy]] — how one deployment serves many churches without any of them seeing each other

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

## The two rules that shape everything

**1. Nothing user-facing is hardcoded.** Every Portuguese string the bot can say — and the menu structure itself — lives in the database and is editable in the admin panel. Portuguese defaults ship as *seed rows*, not constants. If you find yourself typing a Portuguese string into a code path that reaches a member, stop: it belongs in `church` or `menu_item`. See [[Data Model]].

**2. Every query that touches church-owned data is scoped by `church_id`.** Not "should be" — every one. A function taking a bare row id is the dangerous shape, because ids travel in URLs and URLs are attacker-controlled. A church's membership reveals religious conviction, which is sensitive data under LGPD Art. 5 II, so a leak here is a sensitive-data breach rather than a bug. See [[Multi-Tenancy]].

## Conventions
- Notes are **evergreen**: update in place, don't append forever.
- New decision? Add a line to [[Decisions Log]].
- New gotcha? Add it to [[Troubleshooting]] the day it happens.
- The brain is in English; the *product* is in Portuguese. Don't mix them up.
- Source of truth for the full design: [[Overview]] links the committed spec.
