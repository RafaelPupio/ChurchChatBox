# What's Left

Honest state of the project as of **2026-08-08**, after the first day running against a real database. The strategic view is [[Launch Roadmap]]; the step-by-step is [[Launch Checklist]]. This note is the gap list: what is proven, what is merely written, and what nobody has built yet.

## ✅ Proven against real infrastructure

Not "tests pass" — these ran against the live Neon database, and the webhook ones reached Meta's real Graph API.

| | Evidence |
|---|---|
| Migrations `0000`–`0003` | applied to Neon; 7 tables, 5 enums, 6 unique indexes verified by querying `information_schema` |
| `provisionChurch()` | church + church-scoped admin + the 🔒 Privacidade item, in one call |
| Owner login, church admin login | bcrypt verify + iron-session cookie sealed and read back |
| Two sessions coexisting | `sv_owner` and `sv_admin` at once, no interference |
| **Privilege boundary** | a *valid* church-admin session requesting `/owner/<real-uuid>` is bounced to the vendor login |
| Panel screens | Conteúdo and Configurações render; credentials correctly read-only |
| **Meta verify handshake** | wrong token → 403; right token → 200 echoing the challenge |
| **Forged signature rejected** | bad HMAC → 200, and **no contact row created** — no data written from an unverified body |
| **Tenant routing** | unknown `phone_number_id` → 200, nothing written |
| Inbound recording | contact created, `last_inbound_at` set, message row written |
| Dedupe | same `wa_message_id` twice → exactly one message row |
| **`greeted_at` discipline** | the send failed (fake token, real 401 from Meta) and `greeted_at` stayed **null** — the greeting was not burned. This is the bug fixed on 2026-08-07, holding under real failure. |
| Always-200 | the Graph call failed *and* the error-apology failed, and the handler still returned 200 — so Meta never retries into a duplicate reply |

## ⚠️ Built, but never exercised

Written and typechecked, never run by a human against real data:

- **Caixa de Entrada** — no real conversation has ever landed in it
- **Pedidos de Oração** — no real prayer request has ever been submitted
- **Image upload to Vercel Blob** — the token has never been minted
- **Menu editing** — add, edit, reorder, hide were never driven in a browser
- **The 24h reply window** and the human-handoff flow
- **Suspension** against a live church
- **Session `ttl`** — the 8-hour expiry is inspection-only
- **A successful outbound message.** Everything up to the send is proven; the send itself needs real Meta credentials.

## ❌ Missing entirely — found 2026-08-08

Not deferred decisions. Nobody has built these, and two of them bite on day one.

1. **No password reset, and no way to change your own password.** `hashPassword` appears in the panel *only* to create a new staff account. A secretary who forgets hers must contact Rafael, who must run a script by hand. Every church's first admin also starts on a password the vendor generated and cannot change. **This is launch-blocking for a self-service product.**
2. **No church offboarding.** There is no delete-church anywhere; the only `db.delete(church)` is the compensating rollback inside provisioning. A cancelled church stays forever, and — per the LGPD spec — deleting one would cascade away its erasure receipts.
3. **No monitoring or alerting.** If the webhook starts failing at 2am, nothing tells anyone. The bot would be silently dead until a member complains to the church.
4. **No rate limiting** anywhere, including the webhook, which is a public endpoint.
5. **No onboarding flow.** A new church admin logs in to a bare menu with one item and no guidance about what to do next.
6. **No analytics.** Nobody can tell which menu items members actually use, which is the main signal for what a church should fix.
7. **No backup or restore runbook.** Neon has history, but nothing is written down about using it — and the nota fiscal spec's worst unresolved case is precisely a restore.

## 📝 Specced, ready to plan, not built

All three went through adversarial review until clean. See `docs/superpowers/specs/`.

- **Stripe billing** — card-only, drives `past_due` and suspension automatically
- **LGPD Art. 18 tooling** — access, export, deletion, 12-month purge, vendor-visible erasure signal
- **Nota fiscal** — a *launch dependency*: a church with a CNPJ generally cannot pay without one. Its first task is four experiments against a homologação account, not code.

## 🆕 Requested 2026-08-08, not started

- Mobile polish of the panel (a secretary answers from her phone; this is the real daily use)
- PWA — install to home screen, notify staff when a member is waiting
- Native app (iOS + Android) — a second codebase and two store accounts
- Public marketing website
- Marketing & branding project — *in progress*

## 🚧 Blocked on Rafael

| Blocker | Unblocks |
|---|---|
| **Meta app + test number** | the first successful outbound message; the whole bot conversation end-to-end |
| **Meta business verification** | a real chip, production launch |
| **Accountant** — is ISS due in *my* municipality? | the entire nota fiscal design |
| CNPJ, inscrição municipal, e-CNPJ A1 certificate | issuing any nota |
| Apple + Google developer accounts | the native app |

## The honest summary

The **platform** is real: provisioning, tenant isolation, the panel, and the inbound half of the bot all work against live infrastructure. The **outbound half has never succeeded once**, and that is one Meta app away.

The gaps that would embarrass a launch are not the exotic ones. They are password reset, and knowing when the bot has stopped working.
