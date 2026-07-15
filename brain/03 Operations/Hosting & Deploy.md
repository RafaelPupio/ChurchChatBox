# Hosting & Deploy

**Target: R$ 0/month.** Everything runs on free tiers.

| Piece | Service | Why |
|---|---|---|
| App (webhook + panel) | **Vercel** | Free, HTTPS included (Meta requires it), Git deploys, **no cold-start sleep** |
| Database | **Neon Postgres** | Free tier, serverless-friendly, works with Drizzle |
| Images | **Vercel Blob** | Free tier; monthly calendar + event flyers |
| WhatsApp | **Meta Cloud API** | Free for user-initiated chats — see [[Meta WhatsApp Setup]] |

## Why not Render's free tier
It sleeps when idle and takes **30–60s to wake**. That penalty would land on exactly the late-night "what time is the service?" messages this bot exists to answer. Free isn't free if the first reply of the night takes a minute.

## Why not a VPS
Oracle's always-free VPS has no non-commercial restriction (better for a future product), but it costs **sysadmin time**: Linux, HTTPS certs, updates. Not worth it for one church. Revisit if this becomes a paid product.

## The free-tier fine print
Vercel and Neon free tiers carry **non-commercial expectations**. Fine for one church. **If this becomes a paid product for other churches, hosting must be revisited** — don't let that decision arrive by surprise. See [[Decisions Log]].

## Deploy steps
1. Deploy to Vercel from the repo.
2. Create the Neon database; run migrations + seed (seed = the pt-BR default strings and the 9 menu rows — see [[Menu Inventory]]).
3. Paste Meta credentials into **Configurações**.
4. Point Meta's webhook at the deployed URL.

## Secrets
WhatsApp credentials live **in the database per church**, not in env vars — that's what makes multi-church a data operation. The **Neon connection string** is the one true env var. `.env*` is gitignored; **never commit it**.
