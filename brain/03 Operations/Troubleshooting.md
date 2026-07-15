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

## Real gremlins (append as they happen)
*(none yet — nothing has run against a real database or a real Meta callback)*
