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

What suspension does *not* do is stop recording. The webhook's early return sits deliberately **after** `touchLastInbound()`:

```
findOrCreateContact → recordInboundMessage → dedupe → touchLastInbound → [suspended? stop] → route → send
```

Put that return any earlier and a member who first writes during suspension gets a null `last_inbound_at`: they sink to the bottom of the inbox as a "never messaged" contact, and the 24h reply window reads as already closed the moment the church pays and comes back. Everything that records member state runs; only routing and sending stop.

A suspended church sends **nothing at all** — including the error apology in the webhook's catch block, which is why that call is guarded by `!suspended` as well as `verified`.

## LGPD in one paragraph

A church's membership list reveals religious conviction, which is **sensitive personal data under Art. 5 II**. That raises the stakes on everything above: a cross-tenant leak here is a sensitive-data breach, not a bug. Art. 46 is risk-based rather than prescriptive, so shared-database-with-scoping is a defensible architecture — but only because the scoping is demonstrable, which is what Art. 6 (accountability) actually asks for. The 🔒 Privacidade menu item covers Art. 9 (transparency). Data-subject tooling for Art. 18 (access, portability, deletion) is a **later project** and is not built yet.

## Not built yet

- **Stripe billing.** Nothing writes `past_due` automatically; the vendor sets it by hand from `/owner`.
- **LGPD data-subject tooling** — export, hard delete, retention purge.
- **Per-church custom domains** — everyone shares one panel URL.
