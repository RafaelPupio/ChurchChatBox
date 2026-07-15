# Menu Inventory

The v1 seed menu: **9 rows** = 7 `content` + 1 `prayer` + 1 `human`.

| # | Label | kind | Notes |
|---|---|---|---|
| 1 | ⛪ Horários de Culto | content | |
| 2 | 📍 Endereço e Contato | content | |
| 3 | 📅 Agenda de Eventos | content | |
| 4 | 🗓️ Calendário do Mês | content | **image** — staff upload a fresh one monthly |
| 5 | 🔥 OTB Jovens | content | |
| 6 | 👥 GD Adultos | content | |
| 7 | 💚 Ofertas | content | PIX key + bank details |
| 8 | 🙏 Pedido de Oração | prayer | starts the capture flow |
| 9 | 💬 Falar com Atendente | human | hands off to the inbox |

These are **seed rows**, not code. Staff add/edit/reorder/hide freely — see [[Data Model]].

## ⚠️ The 10-row ceiling
WhatsApp's interactive list allows **10 rows**. We're at 9 — **exactly one slot left**.

The panel must enforce this: block activating an 11th item with a Portuguese explanation. If the church genuinely outgrows 10, the answer is sub-menus (a `submenu` kind), not a silently truncated list. **Open question in the spec** — decide when it actually bites.

## Ofertas, specifically
The item is **"Ofertas" — no dízimos** (Rafael's explicit call, [[Decisions Log]]). Its `body_text` speaks only of ofertas/contribuições and carries the PIX key. Don't let "Dízimos e Ofertas" creep back in.

## Seasonal items
`is_active = false` hides an item **without deleting its content** — e.g. 🎄 Cantata de Natal sleeps 11 months, wakes in December with its text intact.
