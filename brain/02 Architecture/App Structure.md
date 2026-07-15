# App Structure

**One Next.js (TypeScript) app** on Vercel wearing three hats: the WhatsApp webhook, the admin panel, and the data layer. One codebase, one deploy, one thing to monitor.

```
Member (WhatsApp)
      │
      ▼
Meta Cloud API ──webhook──► /api/whatsapp/webhook ──► menu router (pure logic)
      ▲                            │                        │
      └────── Graph API ───────────┘                        ▼
                                                     Neon Postgres
                                                            ▲
Staff (browser) ──► /admin (Conteúdo · Caixa de Entrada ·   │
                            Pedidos de Oração · Config) ────┘
```

## Modules and their boundaries
- **`lib/menu-router.ts`** — the bot's brain. A **pure function**: `(contact state, inbound message, church config) → reply intent`. No I/O, no SDK, no database. This is why it can be tested exhaustively without a network. Keep it that way.
- **`lib/whatsapp.ts`** — the *only* module that talks to Meta's Graph API (list messages, text, images). Swappable if the provider ever changes.
- **`lib/repo/*.ts`** — database access, one module per entity. **The router never touches SQL.**
- **`app/api/whatsapp/webhook/route.ts`** — deliberately thin: verify signature → ack 200 → dedupe → delegate to router → send reply.
- **`app/admin/*`** — the four panel screens; read/write through the same repo modules.

## Why the router is pure
Every interesting rule lives there (menu selection, `menu`/`voltar`/`0`, the two-step prayer capture, human-mode silence, hidden items). Purity means those rules are tested in milliseconds with no fixtures — and it's the difference between confident changes and praying before deploy. See [[Bot Flow]].

## Stack
- **Next.js + TypeScript** on Vercel — one app, HTTPS included (required for Meta webhooks), no cold-start sleep.
- **Neon Postgres + Drizzle ORM** — light and serverless-friendly.
- **Vercel Blob** — images (monthly calendar, event flyers).

Credentials live **per church in the database**, not in env vars — that's what makes church #2 a data operation. See [[Data Model]] and [[Hosting & Deploy]].
