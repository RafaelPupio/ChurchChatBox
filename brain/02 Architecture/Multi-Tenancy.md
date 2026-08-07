# Multi-Tenancy

How one deployment serves many churches without any of them seeing each other.

Related: [[Data Model]] · [[App Structure]] · [[Decisions Log]] · [[Launch Checklist]]

## The shape

One Next.js app, one Neon database, one Vercel Blob store. Every church-owned row carries a `church_id`. There is no per-church deploy, schema, or database.

Two entirely separate audiences use the web app:

| | Church staff | Vendor (Rafael) |
|---|---|---|
| Enters at | `/admin/login` | `/owner/login` |
| Cookie | `sv_admin` | `sv_owner` |
| Table | `admin_user` (has `church_id`) | `owner_user` (**no** `church_id`) |
| Can see | exactly one church | every church |
| Can edit | that church's bot content | churches, Meta credentials, status |

Both session payloads carry a `kind` discriminator (`'admin'` / `'owner'`), so a church cookie presented to an owner route — or the reverse — fails as a type error rather than a subtle authorization slip.

## How a message finds its church

Every church has its own WhatsApp number, so the inbound webhook routes by `phone_number_id`:

```
Meta webhook → phone_number_id → church row → that church's app_secret verifies the signature
```

The church is resolved **before** the signature is checked, because the secret used to verify is per-church. `phone_number_id` and `webhook_verify_token` both carry unique indexes — two churches sharing either one would make routing ambiguous.

## The isolation rule

> Every function that reads or writes church-owned data takes a `churchId` and uses it in the `WHERE` clause.

Not "should" — every one. The dangerous shape is a function that takes only a row id, because ids travel in URLs and a URL is attacker-controlled. A church admin can paste another church's contact id into their address bar; the query must not care.

Two supporting rules:

- **`.set()` payloads are allowlisted, not just filtered.** `updateChurch` accepts only the 11 columns the Configurações form legitimately edits. Without that, one refactor to `Object.fromEntries(formData)` would let a suspended church POST `status=active` and un-suspend itself, or write a `phone_number_id` to capture another tenant's inbound messages.
- **`src/lib/repo/platform.ts` is owner-only.** It is the one module with cross-church queries. Nothing reachable from `src/app/admin/` or the webhook may import it.

## How the rules are enforced

Prose in a comment is not a control. Three test suites are:

| Suite | What it proves |
|---|---|
| `tests/tenant-isolation.test.ts` | schema-level — cascade behaviour, `phone_number_id` routing |
| `tests/repo-isolation.test.ts` | calls the **real** repo functions with church A's id against church B's rows, asserts B is unchanged |
| `tests/privilege-boundary.test.ts` | no church-facing file imports the owner-only repo; every protected page uses the re-checking read guard |

These run on PGlite — real Postgres in WASM, with the real migrations applied — so the SQL semantics are genuinely exercised, not mocked.

**The boundary test taught the most useful lesson on this project.** Its first version matched the literal string `repo/platform` in import specifiers. That passes for `@/lib/repo/platform` — and sails straight past `import … from './platform'` written inside `src/lib/repo/` itself, which names the exact same module. It also never scanned `src/lib` at all, exempting `writable.ts`, which every admin write action imports. The guard was enforcing a *naming convention* while appearing to enforce a *boundary*.

It now resolves every specifier to an absolute path before comparing. The general lesson: **a guard you have never watched fail is not a guard.** Inject the violation, watch the test go red, revert. Do it every time.

## Status and suspension

`effectiveStatus(status, graceUntil, now)` derives the real state:

- `active` → everything works
- `past_due` **inside** `graceUntil` → everything still works (7 days, `GRACE_PERIOD_MS`)
- `past_due` **past** `graceUntil` → treated as suspended
- `suspended` → silent bot, read-only panel

It **fails toward service**: a `past_due` row with no `graceUntil` keeps working. Silencing a paying church because of a missing timestamp is far worse than a few extra days of service for one that isn't.

What suspension does *not* do is stop recording:

```
findOrCreateContact → recordInboundMessage → dedupe → touchLastInbound
  → route() → save prayer → commit "member facts" → [suspended? stop] → send → commit "delivered facts"
```

The gate is one early `return`, placed so that **every send site is textually below it**. That shape is deliberate: written as `if (!suspended) { send }` instead, the code after the block stays reachable, and "a suspended church sends nothing" degrades from a structural guarantee into a convention every future call site has to remember. A suspended church sends **nothing at all** — including the error apology in the catch block, guarded by `!suspended` as well as `verified`.

The gate's *position* was got wrong twice, in opposite directions, and both are worth remembering.

**Too early.** The first version returned before `touchLastInbound()`. A member who first wrote during suspension got a null `last_inbound_at`, sank to the bottom of the inbox as a "never messaged" contact, and their 24h reply window read as already closed the moment the church paid and came back.

**Still too early.** The second version returned before `route()`. That silenced the bot correctly but also skipped the prayer capture and every mode transition — so a member mid-prayer had their prayer land in `message` and never become a `prayer_request`, and stayed armed in `awaiting_prayer` so their first word after reactivation was filed as their prayer.

### The rule that replaced the guesswork

> A mode transition may be persisted **before** delivery only if it is a fact about what the MEMBER did. A transition that only makes sense because the member **received** something waits for a successful send.

Suspension is just the permanent, deterministic case of "the send did not happen", so the behaviour falls out of ordering. `modeAfterUndeliveredTurn` in `contact-mode.ts` encodes it as an exhaustive `switch` with no `default` — adding a fourth `ContactMode` becomes a compile error rather than a silent misclassification.

Its subtlest case: a member in `awaiting_prayer` who taps "Falar com Atendente" while suspended must be moved to `bot`, not left where they are. Three independent design passes proposed falling back to the stored mode here, which leaves them armed — the fix for the prayer bug reproducing the prayer bug.

### Greeting-ness is a stored fact, not an inference

`contact.greeted_at` is written **only after the greeting actually sends**. It replaced "did we just INSERT this row", which conflated *a member arriving* with *a member being greeted*. Those differ whenever nothing gets sent — and that is not only under suspension: at a perfectly healthy church, one Graph API hiccup on a member's very first message used to burn their greeting permanently, leaving them on the fallback text forever.

## LGPD in one paragraph

A church's membership list reveals religious conviction, which is **sensitive personal data under Art. 5 II**. That raises the stakes on everything above: a cross-tenant leak here is a sensitive-data breach, not a bug. Art. 46 is risk-based rather than prescriptive, so shared-database-with-scoping is a defensible architecture — but only because the scoping is demonstrable, which is what Art. 6 (accountability) actually asks for. The 🔒 Privacidade menu item covers Art. 9 (transparency). Data-subject tooling for Art. 18 (access, portability, deletion) is a **later project** and is not built yet.

## Not built yet

- **Stripe billing.** Nothing writes `past_due` automatically; the vendor sets it by hand from `/owner`.
- **LGPD data-subject tooling** — export, hard delete, retention purge.
- **Per-church custom domains** — everyone shares one panel URL.
