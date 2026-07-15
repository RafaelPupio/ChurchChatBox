# Secretária Virtual — WhatsApp Church Bot

**Design doc** · 2026-07-15 · Status: approved

## Overview

A WhatsApp automated secretary for a church, answering members in Brazilian Portuguese through a dedicated church number. It replies to menu selections with church information (service times, address, events, monthly calendar, youth and adult groups, offerings), receives prayer requests, and hands conversations over to real staff when asked.

Church staff manage everything through a Portuguese web admin panel. No developer is needed to change what the bot says or which options it offers.

### Guiding principle: everything is customisable

**No user-facing string is hardcoded.** Every text the bot can emit lives in the database and is editable in the admin panel — the greeting, the menu items and their contents, the prayer prompts, the handoff message, the fallback for unrecognized input, the error message, even the list button label ("Ver opções") and the section header. Implementation must never inline a Portuguese string in a code path that reaches a user; it reads from `church` or `menu_item`. Seed data provides sensible pt-BR defaults so the bot works on day one, but each default is an editable row, not a constant.

The same rule drives the data model: menu **structure** is data, not code. Staff add, edit, reorder, and hide items freely.

### Decisions taken (and why)

| Decision | Choice | Reason |
|---|---|---|
| Scope | One church now, architected for multi-church later | Every table keyed by `church_id` from day one; church #2 is a row, not a rewrite |
| Bot style | Menu-only, no AI | Predictable, zero AI cost, sufficient for informational needs |
| WhatsApp connection | Official Meta Cloud API | Free for user-initiated conversations, no ban risk, the only viable base for a product |
| Number | New dedicated chip | A number bound to the Cloud API stops working in the WhatsApp app; the church's existing number keeps working untouched |
| Content editing | Web admin panel (pt-BR) | Non-technical staff must be self-sufficient |
| Human contact | Inbox in the panel | Keeps conversations on the church number; staff can't use the app on a Cloud API number |
| Hosting | Vercel + Neon + Vercel Blob (free tiers) | R$ 0/month, no server administration, instant replies (no cold-start sleep) |
| Language | pt-BR everywhere user-facing | Bot messages *and* the entire admin UI; code identifiers stay English |

## Architecture

One **Next.js (TypeScript)** app on Vercel with three faces:

1. **Webhook** — `/api/whatsapp/webhook`. Receives Meta Cloud API messages, replies via the Graph API.
2. **Admin panel** — `/admin`, login-protected, entirely in Portuguese.
3. **Data** — Neon Postgres via Drizzle ORM (light, serverless-friendly). Images (monthly calendar, event flyers) in Vercel Blob.

WhatsApp credentials are stored per church in the database, not in environment variables — this is what makes onboarding a second church a data operation.

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

### Design for isolation

- **`lib/menu-router.ts`** — pure function: `(contact state, inbound message, church config) → reply intent`. No I/O, no WhatsApp SDK. This is the bot's brain and the most-tested unit.
- **`lib/whatsapp.ts`** — the only module that talks to the Graph API. Sends list messages, text, images. Swappable if the provider ever changes.
- **`lib/repo/*.ts`** — database access, one module per entity. The router never touches SQL.
- **`app/api/whatsapp/webhook/route.ts`** — thin: verify signature → ack 200 → dedupe → delegate to router → send reply.
- **`app/admin/*`** — panel screens; read/write through the same repo modules.

Each unit is understandable and testable on its own; the router in particular can be exercised exhaustively without a network or database.

## Data model

All tables carry `church_id` from day one. v1 has exactly one church row.

- **`church`** — name; WhatsApp credentials (`phone_number_id`, `access_token`, `webhook_verify_token`, `app_secret`); and every global bot string: `greeting_text`, `menu_header_text`, `menu_button_label`, `fallback_text` (unrecognized input), `unsupported_media_text` (audio/sticker/photo), `error_text` (system failure), `prayer_prompt_text`, `prayer_thanks_text`, `handoff_text`, `handoff_closed_text`.
- **`menu_item`** — `church_id`, `position`, `label` (e.g. "💚 Ofertas"), `body_text`, `image_url` (nullable), `is_active`, and `kind`:
  - `content` — replies with `body_text` + optional image. Covers Horários, Endereço, Agenda, Calendário do Mês, OTB Jovens, GD Adultos, Ofertas, and anything staff invent later.
  - `prayer` — starts the prayer-request capture flow.
  - `human` — switches the contact to human mode.
- **`contact`** — `church_id`, `phone`, `name`, `mode` (`bot` | `human` | `awaiting_prayer`), `mode_changed_at`, `last_inbound_at` (drives the 24h window).
- **`message`** — `church_id`, `contact_id`, `wa_message_id` (unique — dedupe key), `direction`, `body`, `created_at`. Powers the inbox.
- **`prayer_request`** — `church_id`, `contact_id`, `text`, `status` (`novo` | `orado`), `created_at`.
- **`admin_user`** — `church_id`, `email`, `password_hash`, `name`.

**v1 menu seed — 9 rows total** (7 `content` + 1 `prayer` + 1 `human`):

| # | Label | kind |
|---|---|---|
| 1 | ⛪ Horários de Culto | content |
| 2 | 📍 Endereço e Contato | content |
| 3 | 📅 Agenda de Eventos | content |
| 4 | 🗓️ Calendário do Mês | content (image) |
| 5 | 🔥 OTB Jovens | content |
| 6 | 👥 GD Adultos | content |
| 7 | 💚 Ofertas | content |
| 8 | 🙏 Pedido de Oração | prayer |
| 9 | 💬 Falar com Atendente | human |

> WhatsApp's interactive list allows 10 rows, so exactly one slot remains before pagination becomes necessary. The panel must enforce this (see Open questions).

**Ofertas, specifically:** the item is named "Ofertas" — no dízimos, per explicit decision. Its `body_text` speaks of ofertas/contribuições only and carries the PIX key and bank details, all editable.

## Conversation flow

All quoted strings below are *defaults*, editable in the panel.

- **Any unrecognized text, or first contact** → greeting + interactive list menu: *"Olá! 🙏 Sou a secretária virtual da [Igreja]. Como posso te ajudar?"*. `menu`, `voltar`, or `0` always return to the menu.
- **`content` item selected** → send `body_text` (+ image if set), then offer the menu again.
- **`prayer` item selected** → contact enters `awaiting_prayer`; bot asks *"Pode escrever seu pedido de oração 🙏"*; the next inbound message is stored as a `prayer_request`; bot confirms *"Recebemos seu pedido! ❤️ Nossa equipe estará orando por você."*; back to `bot` mode.
- **`human` item selected** → contact enters `human` mode; **bot goes silent for that contact**; conversation surfaces in the panel inbox. Staff reply from the panel and click **"Encerrar atendimento"** to return the contact to `bot` mode. Automatic reversion after **24h of staff inactivity** so nobody is stranded in silence.
- **Audio, stickers, images sent to the bot** → `unsupported_media_text` + menu.

**Delivery:** native WhatsApp interactive **list message** (tappable). A plain numbered-text fallback ("Digite *1* para…") is sent when the list send fails or the client doesn't render it — the router builds both from the same `menu_item` rows.

## Admin panel (100% pt-BR)

Login-protected. Four screens:

1. **Conteúdo** — menu editor: add / edit / reorder (drag) / hide items; edit `body_text`; upload images (Calendário do Mês is a `content` item with a fresh image each month). Hiding preserves content (e.g. "🎄 Cantata de Natal" dormant for 11 months).
2. **Caixa de Entrada** — conversation list + chat view; staff reply through the church number; shows the remaining **24-hour window** and blocks sends once expired, with a Portuguese explanation.
3. **Pedidos de Oração** — list with status *Novo* / *Orado*.
4. **Configurações** — church name, all bot strings, WhatsApp credentials, staff accounts.

## Error handling

- **Always 200 to Meta, immediately.** Non-200 triggers Meta retries → duplicate replies to real people. Acknowledge first, process after; log failures rather than surfacing them to Meta.
- **Dedupe by `wa_message_id`.** Meta may deliver the same message more than once; a repeated ID is dropped silently.
- **Verify the webhook signature** (`X-Hub-Signature-256` against `app_secret`); reject unsigned/invalid requests so nobody can inject messages into the inbox.
- **Fail toward the human, never toward silence.** On database or unexpected failure, send `error_text` — *"Estamos com uma instabilidade no momento. Por favor, tente novamente em instantes 🙏"*. Silence is the worst outcome for a church.
- **24-hour window** — expired replies are blocked in the panel with an explanation, not a mystery failure.
- **Graph API send failures** — logged with context; a failed send never crashes the webhook.

## Testing

- **Unit — `menu-router`** (the priority): menu selection; `menu`/`voltar`/`0`; the two-step prayer capture; hidden items never appear; human mode silences the bot; unsupported media fallback; list-vs-text fallback construction.
- **Integration — webhook**: signature rejection; deduplication of a repeated `wa_message_id`; 200-always guarantee under a failing database; human-mode silence end to end.
- **Manual — Meta test number**, before connecting any real number. This is where the Portuguese wording gets judged by ear.

The prayer flow and human handoff receive the most rigor: they touch people at vulnerable moments, where a bug costs more than a wrong service time.

## Launch checklist (outside the code)

1. Create Meta Business account + WhatsApp Business app.
2. **Start business verification early** — it can take days and may request documents (CNPJ helps).
3. Buy a new chip for the dedicated bot number.
4. Connect the number in Meta's console; set the webhook URL + verify token.
5. Deploy to Vercel; create the Neon database; run migrations + seed.
6. Paste Meta credentials into **Configurações**.
7. Fill real content: horários, endereço, PIX for ofertas, calendário image.
8. Test end-to-end from a personal phone.
9. Announce the new "secretaria virtual" number to members.

**Cost: R$ 0/month.** Vercel, Neon, and Blob free tiers cover this workload; Meta does not charge for user-initiated conversations. (Free tiers carry non-commercial expectations — revisit hosting if this becomes a paid product.)

## Non-goals (v1)

- No AI / natural-language understanding (menu-only, by decision).
- No church-initiated broadcasts or template messages (paid, and needs Meta template approval).
- No multi-church onboarding UI — the schema supports it; the UI comes later.
- No member database, giving records, or event registration.

## Open questions (resolve during implementation)

- **>10 active menu items:** the panel must prevent or paginate. Proposal: block activating an 11th item with a Portuguese explanation; revisit sub-menus if the church actually needs more.
- **Access token longevity:** Meta system-user tokens can be long-lived; confirm the exact type at setup and document renewal in Configurações if it expires.
