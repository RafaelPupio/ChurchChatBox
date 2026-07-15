# Bot Flow

What the bot says and when. **Every quoted string below is a default** — all editable in the panel. See [[Data Model]].

## The states a contact can be in
`bot` (normal) · `awaiting_prayer` (next message is a prayer request) · `human` (bot silent, staff handling)

## Flows
- **First contact, or any unrecognized text** → greeting + the interactive list menu:
  *"Olá! 🙏 Sou a secretária virtual da [Igreja]. Como posso te ajudar?"*
- **Escape hatches** — `menu`, `voltar`, or `0` always return to the menu, from any state except `human`.
- **`content` item tapped** → send `body_text` (+ image if set) → offer the menu again.
- **`prayer` item tapped** → contact enters `awaiting_prayer` → *"Pode escrever seu pedido de oração 🙏"* → **the next inbound message is stored** as a `prayer_request` → *"Recebemos seu pedido! ❤️ Nossa equipe estará orando por você."* → back to `bot`.
- **`human` item tapped** → contact enters `human` → *"Um momento! 😊 Alguém da secretaria vai te atender por aqui."* → **bot goes silent**; conversation appears in the panel inbox. Staff click **"Encerrar atendimento"** to return the contact to `bot`. **Auto-reverts after 24h of staff inactivity** so nobody is stranded in silence.
- **Audio / stickers / images sent to the bot** → `unsupported_media_text` + menu.

## Delivery: list first, text as fallback
The menu is a **native WhatsApp interactive list** (tappable). A plain numbered fallback (*"Digite 1 para…"*) is sent if the list send fails or the client can't render it. **Both are built from the same `menu_item` rows**, so they can never drift apart.

## The two flows that deserve the most care
The **prayer flow** and the **human handoff** touch people at vulnerable moments. A bug in "Horários de Culto" is an annoyance; a swallowed prayer request or a bot interrupting a pastoral conversation is a different kind of failure. Test these hardest — see [[Troubleshooting]].
