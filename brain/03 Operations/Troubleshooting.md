# Troubleshooting

Every gremlin and its fix. **Add to this the day it happens**, not later.

## Known traps (designed for, before they bite)

**Member gets the same reply 2–3 times**
Meta re-delivers messages — both on retry *and* sometimes on success. Fix: `message.wa_message_id` is **unique**; a repeated ID is dropped silently. If duplicates appear, check that constraint first.

**Meta keeps retrying / floods the webhook**
Any non-200 response makes Meta retry, which means **duplicate replies to a real person**. Rule: **ack 200 immediately, then process**. Never let an exception escape the route handler. Log failures instead of throwing them at Meta.

**The bot went silent for one person**
Expected if they're in `human` mode — the bot is *supposed* to be silent. Check `contact.mode`. It auto-reverts to `bot` after **24h of staff inactivity**; if someone is stuck, that's a bug in the revert, not the router.

**Staff can't send a reply from the inbox**
Almost certainly the **24-hour window** — Meta forbids free-form replies more than 24h after the member's last message. The panel should block the send and **explain in Portuguese**, not fail mysteriously. Not a bug; a Meta rule. See [[Meta WhatsApp Setup]].

**Fake messages appear in the inbox**
Webhook signature verification is missing or broken (`X-Hub-Signature-256` vs `app_secret`). Anyone with the URL can post otherwise.

**Menu doesn't show all items**
WhatsApp lists cap at **10 rows** and we're at 9. See [[Menu Inventory]] — the panel must prevent an 11th active item.

**Something broke and the member saw nothing**
Silence is the worst outcome for a church. Any unexpected failure must still send `error_text` (*"Estamos com uma instabilidade no momento…"*). If a member got silence, that path is missing its catch.

## Caught in review, before they ever ran

These were all found reviewing the bot-core branch. They're recorded because each one was invisible from the outside — the bot would have looked fine while doing the wrong thing.

**A member handed to a human was silenced forever.** The spec's 24h auto-reversion had *no task implementing it* — `mode_changed_at` was written and never read. A member would tap "Falar com Atendente", be told *"alguém vai te atender em breve"*, and be ghosted permanently: no panel to answer them, no timeout, and escape words don't work in `human` mode by design. Fixed by [[Bot Flow]]'s reversion, computed at the webhook edge (`src/lib/contact-mode.ts`) so [[App Structure]]'s router stays pure. **If someone still gets stuck:** `UPDATE contact SET mode = 'bot' WHERE phone = '<number>';`

**An empty menu apologised to everyone.** `buildListPayload` only guarded the *upper* bound (10 rows). With zero active items it built a legal-looking zero-row list; Meta rejects that with a 400, so every single member would get *"Estamos com uma instabilidade"* with no hint the real problem was an empty menu. Most likely first-run failure if the seed is forgotten — see [[Menu Inventory]].

**An empty prayer was thanked but never saved.** A whitespace-only message got captured as `prayerRequestText: ''`, and the webhook's `if (result.prayerRequestText)` skipped saving it — while the bot replied *"Recebemos seu pedido! ❤️"*. A false confirmation nobody could detect. Now re-prompts instead.

**The failure apology could message strangers.** `notifyFailure` re-parsed the *unverified* body and messaged whatever `from` it found. On a database blip, anyone knowing the URL could make the church's number message arbitrary phones. Now only reachable with a verified signature.

**`"+1"` selected menu item 1.** Bare `Number()` coerces `'+1'`, `'0x1'` and `'1e0'` to `1`. Someone typing "+1" in a chat would silently get Horários. Now gated on `/^\d+$/`.

**Mode was saved before the reply was sent.** If a send failed, the contact was left in a mode they were never told about — for the prayer flow that meant their *next* message ("oi") got captured as their prayer request. Mode now persists only after a successful send. `savePrayerRequest` deliberately stays *before* the send: better a saved prayer whose confirmation failed than a prayer lost.

**Emoji labels could render broken.** `.slice(0, 24)` cuts UTF-16 code units, and every label here starts with an emoji — a cut inside a surrogate pair renders as a broken glyph. Now grapheme-safe.

## Caught reviewing the admin panel (Plan A), before it ran

**A too-long menu button label silently bricks the whole menu.** Meta caps the interactive-list *button* at **20 characters**. The Configurações screen used to save `menuButtonLabel` with only a non-empty check, and the field invites editing ("Rótulo do botão do menu (ex.: Ver opções)"). An admin types "Toque para ver as opções" (24 chars), the panel says *"Salvo! ✓"*, and from then on **every** menu the bot sends fails with a Graph 400 → the webhook serves `errorText` instead of the menu. The bot's core feature dies with zero feedback in the panel. The default "Ver opções" (10 chars) passes every automated gate, so nothing downstream catches it — this is the exact "nothing catches it before it reaches a real church" class. Fixed: `validateButtonLabel` caps it at 20, and `validateChurchText` caps the other bot texts at 1024 (Meta's list `body.text` limit). **If the bot suddenly answers everything with the instability message, check the button label length first.**

**A content menu item with no text and no image would make the bot send an empty message** (a Graph 400, same failure family). The panel blocks it: a `content` item needs a non-empty body OR an image before it saves (`validateMenuItemContent`).

**Every by-id edit is church-scoped.** With one church it looks like overkill, but `updateMenuItem`/`deleteAdmin` filter on both id AND `church_id` so church #2 can never edit church #1's rows by guessing an id.

## ✅ Verified against a real Postgres engine (2026-07-16)

Before any Neon project existed, the migration and the risky Postgres semantics were executed against a real Postgres (PGlite, an in-process build of Postgres). **14/14 checks passed.** This retires most of the "never executed" risk on the data layer:

- **The migration applies cleanly** — all 21 statements, producing the 6 tables, 4 enums, and 4 unique indexes.
- **The dedupe gate genuinely works** — the highest-leverage assumption in the project. A new `wa_message_id` returns 1 row (bot replies); a re-delivered one returns 0 rows (bot stays silent); only one row is stored. Had this inverted, the bot would have treated *every* message as a duplicate and gone completely silent. See [[Data Model]].
- **Outbound rows may all leave `wa_message_id` NULL** — Postgres permits many NULLs in a unique index, so replies don't collide with the dedupe index.
- **The contact race guard works** — a duplicate `(church_id, phone)` conflicts and returns 0 rows, so the re-fetch path in `findOrCreateContact` is the one that runs.
- **`getNextPosition` on an empty menu** → `max()` is NULL → yields 1. And 10 after the 9 seed rows.
- **The 9-row seed insert lands atomically**; the prayer-list join returns prayer + contact with status defaulting to `novo`; **cascade delete** cleans every child table.

**One real bug was found this way, not by review:** in a `DESC` sort Postgres puts NULLs **first**, so contacts who had never messaged floated to the *top* of the Caixa de Entrada, above real recent conversations. Fixed with `desc nulls last` in `listConversations`, and the fix re-verified on the same engine.

**Still unverified** (needs Neon + Meta + a browser): the neon-http driver specifically, the login/session round-trip, the panel's Server Actions, Blob upload, and any real WhatsApp send.

## Real gremlins (append as they happen)
*(none yet in production — nothing has run against Neon, a real Meta callback, or a real browser login)*
