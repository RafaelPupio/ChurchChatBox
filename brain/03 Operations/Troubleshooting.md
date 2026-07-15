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

## Real gremlins (append as they happen)
*(none yet — no code written)*
