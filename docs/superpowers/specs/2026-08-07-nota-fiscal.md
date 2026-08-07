# Secretária Virtual — Nota Fiscal (NFS-e)

**Design doc** · 2026-08-07 · Status: proposed · **Revision 1** (adversarial review closed — see "Revisions")

## Overview

The Stripe spec makes a church's money correct. This one makes Rafael's paperwork correct, and it is deliberately a *different* subsystem because the two fail apart from each other: **a payment can succeed while the nota fails, and then the church owes nothing and Rafael owes a document.** Nothing in this design is allowed to make a nota failure look like a billing failure, and nothing is allowed to make a billing success imply a nota exists.

**This blocks revenue, not just compliance.** A church with a CNPJ has bookkeeping. Its treasurer generally cannot lawfully record a recurring payment without a fiscal document, and many will simply refuse to pay a subscription that produces none. So the sequence is not "sell, then sort out the nota" — it is **no nota, no sale**, with perfect billing code sitting idle behind it. The owner already recorded this as a launch dependency (`.superpowers/sdd/owner-decisions-2026-08-07.md:31-33`) and it is the reason this document exists at all rather than being a bullet in the billing spec's out-of-scope list.

Note what immunity does *not* buy anyone here. A church is immune under CF art. 150, VI, "b" — that protects the church from taxes on its own patrimony, income and services. It does not remove the church's need for the document.

**Provisional, and flagged as such rather than asserted:** the working reading is that this immunity does not touch the ISS **Rafael** owes as *prestador*, so immunity makes the church's side simpler and Rafael's side unchanged. That reading is not confirmed. It is exactly what the substituto-tributário question on the unverifiable list would overturn — if a municipality may designate an immune religious entity an ISS retention agent, the taker's condition changes both the fields on the document and the amount Rafael receives. Nothing in this spec is allowed to state the working reading as settled, here or in the environment table.

### What "done" means

1. Every successful subscription payment produces exactly one nota fiscal, or a visible, actionable row explaining why it has not yet.
2. **Never two notas for one payment.** A duplicate row is a UI annoyance; a duplicate nota is a tax problem with a cancellation window measured in days.
3. A nota that fails is retried automatically inside the fiscal deadline, and when automation cannot recover, Rafael can issue it by hand and record it here without the queue lying about it afterwards.
4. A church that pays before supplying its CNPJ — **the normal case, not the edge case** — accumulates claimed, blocked notas that all drain the moment its fiscal data is saved, each with its own correct competência.
5. A refunded payment never produces a nota if the refund was visible when the run started, and when a nota already exists the cancellation attempt is prompt and a refusal shouts rather than failing silently.
6. Nothing in this subsystem can write a single column of `church`. Not `status`, not `grace_until`, not the Stripe mirrors.
7. The invoicing vendor is replaceable behind one interface with three verbs, and the reason that matters is on the record below.

### What already exists (verified, not assumed)

| Thing | Where | State |
|---|---|---|
| `church` row, 20 columns | `src/db/schema.ts:11-49` | **No fiscal field of any kind.** No CNPJ, no razão social, no address, no municipality. |
| `church.name` | `src/db/schema.ts:13` | A free-text **display** name, editable by the church secretary. Not a razão social. |
| The 11-column church-editable allowlist | `src/lib/repo/church-admin.ts:17-29` | `name` is in it. Anything fiscal placed on `church` lands next to a column the tenant can rewrite. |
| `provisionChurch(name, adminEmail, password)` | `src/lib/provisioning.ts:33-37` | Three arguments. `createChurch` collects three form fields (`src/app/owner/(protected)/actions.ts:25-27`). |
| Owner-only cross-church repo | `src/lib/repo/platform.ts:6-8` | The pattern this subsystem's repo copies. |
| Privilege suite | `tests/privilege-boundary.test.ts:24-28`, `:45`, `:53-59` | Roots are `src/app/admin`, `src/app/api`, `src/lib`; `walk()` skips the allowed set on `:45`; `resolveSpecifier` returns `null` for bare package specifiers on `:57`. |
| Migrations | `drizzle/` | `0000`–`0003`. This spec's migration takes whatever number `drizzle-kit` assigns at build time — see "Migration numbering". |
| Pure-rule pattern | `src/lib/church-status.ts` | `effectiveStatus` is pure, tested, no I/O. The fiscal deadline rule copies it exactly. |
| Unique-index error surfaced in pt-BR | `src/app/owner/(protected)/[churchId]/actions.ts:37-42` | The pattern for turning a constraint name into a sentence a human can act on. |

Everything this subsystem needs from the product is either new or borrowed from the billing spec. **Nothing about a church's tax identity exists today.**

## Decisions taken (and why)

| Decision | Choice | Reason |
|---|---|---|
| Invoicing provider | **Focus NFe**, behind a three-verb interface | See "The provider". Verified public pricing at the right size, a real REST API rather than an ERP or a hosted connector, and an `nfse-nacional` surface documented separately from the per-municipality one. |
| What triggers a nota | A **row in billing's `stripe_event` ledger**, never a webhook of our own | One Stripe endpoint, one signature check, one idempotency claim. Consuming the ledger instead of the wire also means anything billing repairs later — an `unmatched` event bound to a church next Tuesday — is picked up automatically, because the claim step is a *query*, not a trigger. |
| Where the nota work runs | A cron-driven queue, **never inside the webhook request** | A nota failure inside billing's handler would make Stripe retry an event whose billing work is done, coupling the two failure domains the owner deliberately separated. |
| Idempotency | **Two independent layers**: `UNIQUE (stripe_invoice_id)` in our table, and a `ref` at the provider **derived from the Stripe invoice id**, not from our row | A duplicate nota is expensive to unwind — cancellation windows are municipal and short. The two layers are only independent if the second survives the loss of the first, which is why the ref is `nf-{stripe_invoice_id}-{attempt}` and never a random uuid: it is reconstructible from Stripe alone, so a restored-from-backup database still asks the vendor about the same ref. See "The ref is derived from Stripe, not from us". |
| The crash window | A dedicated `enviando` state that is **queried, never re-sent** | Sending and recording the result cannot be atomic — neon-http has no transactions. So a row whose send began and whose result was never read is not "unknown, retry"; it is "unknown, go ask". This is the single most load-bearing decision in the document. |
| Competência | Stored on the row, derived once from the invoice's line-item `period_start` **in America/São_Paulo** | The fiscal event is *service rendered in month M*, not *card cleared on day D*. A card that fails on the 3rd and succeeds on the 11th does not move the competência. Deriving it at read time from a webhook timestamp would. |
| The amount | **Stored**, in integer centavos, on the nota row | The billing spec refuses an `amount` column on `church` because a mirrored *live* price can disagree with Stripe and nothing says which is right. A nota is the opposite: a frozen record of one past transaction. Once issued, the number on the document is the number, and Stripe disagreeing later does not change what the prefeitura holds. Same reasoning method, different answer. |
| Church tax data | A **separate `church_fiscal` table**, not columns on `church` | `updateChurch`'s allowlist (`church-admin.ts:17-29`) guards *columns on that row*. A CNPJ sitting beside `name` is one careless `Object.fromEntries` refactor away from being tenant-editable, and a church that can rewrite its own CNPJ can misdirect a fiscal document. A separate table cannot be reached by that function at all. |
| Who supplies tax data | **Rafael, in `/owner`, from the cartão CNPJ.** The church sees it read-only | Same argument. Also: razão social must match the CNPJ card exactly, and a secretary typing what the church calls itself is precisely the failure this prevents. |
| Provisioning | **Unchanged.** Still three arguments | Requiring fiscal data at creation would block Rafael from provisioning a church before he has its CNPJ card, and provisioning-then-billing is the actual order of events. The cost — a church silently missing fiscal data — is paid off by a badge in the church list from day one, not by a required field. |
| What the church may edit | **Nothing fiscal.** The whole card is owner-only | Splitting one card into two privilege levels ("they can fix the e-mail, not the CNPJ") is how allowlists grow. The 11-column allowlist stays 11 columns. |
| The XML | **Stored in our database as text**, not linked | Rafael is legally required to retain the documents. Nuvem Fiscal announced its own shutdown seven days before this spec was written — a vendor URL is not an archive. An NFS-e XML is single-digit kilobytes; at tens per month this is one `text` column, not a pipeline. |
| Refund vs dispute | A **full refund** triggers a cancellation attempt; a **dispute** does not | Billing records both passively and correctly — for *status*, passivity is right. For the nota it is not, because the correction clock is already running. A dispute may still resolve in Rafael's favour and the money may never leave; a refund is settled. A **partial** refund needs a substituting nota at a reduced value, which is an accountant's call, so it is flagged, not automated. |
| Deadline rule | **Provisional placeholder**, not a finding: issue inside the competência month, and never later than the 5th of the following month. A named constant in `prazo.ts`, changed in a diff | **The earlier draft called this "the safe envelope over every municipal variant found" and that was wrong, in the direction that hurts.** The variants found are SP (RPS→NFS-e in 10 days, and by the 5th when the taker collects), RJ (by the 5th, Decreto 46.799/2019) and *no ato da prestação* in many cities. A rule permitting the 5th of the **following** month is the loosest of those, not an envelope over them: in a *no ato* municipality it is up to ~35 days late. The real window is on the unverifiable list, so this ships as a placeholder Rafael's accountant replaces, and the queue is built to shout early rather than to trust the number. |
| Manual issuance | A first-class recorded state, not a workaround | The Emissor Nacional (gov.br) is free and needs no integration. A subsystem that cannot say "Rafael did this one by hand" leaves a permanently red row for a document that exists, which trains him to ignore the queue. |
| Privilege | Everything issuing-related is **owner-only**; one narrow church-facing read module | Copied wholesale from the billing spec's `stripe-client.ts` / `stripe-portal.ts` split, including the revision-3 tightening that deletes the tenant argument. |
| Writes to `church` | **Zero.** Not one column | The plainest possible statement of independent failure, and it is enforceable by reading the repo module. |

## The provider

**The call is Focus NFe.** One provider, not a menu.

### Why

- **Verified pricing, at Rafael's actual size.** Read from `focusnfe.com.br/precos` on 2026-08-07: **Solo, R$ 89,90/mês, 1 CNPJ, pacote com 100 notas, R$ 0,10 por nota adicional, 30 dias de testes**, NFS-e included. Start is R$ 113,90 for 3 CNPJs; Growth R$ 548,00. Rafael will issue tens of notas a month. Solo is the plan and it is the cheapest credible option that still has an API.
- **It is an API, not something else with an API.** Omie is an ERP: adopting it means a customer registry, a service registry and a fiscal configuration that all have to be kept in sync with the `church` table — a second source of truth, which is exactly what the billing spec's "money lives in Stripe" reasoning argues against. Spedy's cheap tiers have no API at all.
- **It documents `nfse-nacional` as a surface distinct from the per-municipality NFS-e API** (verified at `doc.focusnfe.com.br` on 2026-08-07, which lists both). That distinction matters precisely because the single open question about Rafael's city is *which of the two it is on*, and a provider that models both can absorb the answer either way.
- **It publishes technical analysis of NT 007** — the note that formalised the IBS/CBS group on the NFS-e Nacional layout, operative in homologação and produção from 09/02/2026. A vendor writing about the layout change in public is a better signal than a vendor asserting readiness on a landing page.
- **Its model is `ref`-keyed**, which is the shape this design's idempotency needs: our own deterministic string identifies the document at the vendor, so a lost response is a *lookup*, not a guess.

### The trade-offs, stated rather than discovered

- **Rafael uploads his e-CNPJ A1 certificate to Focus NFe.** That is a real delegation: they can issue fiscal documents in his name. It is recorded here as a decision, not omitted. The alternative — holding a `.pfx` and its password in a Vercel environment and doing mTLS plus XMLDSIG-signed XML from a serverless function, with an annual rotation that is an annual outage risk — is worse on every axis this project cares about, and it is worse *specifically* because it puts a rotating secret in the one runtime nobody can log into.
- **Broad product surface he will never touch** (NF-e, CT-e, MDF-e, NFCom). Ignorable.
- **A launch-blocking coverage check that is not a design question.** Whether Rafael's own municipality is integrated must be confirmed before signing; Focus quotes roughly R$ 199 and about 15 days to add a missing one. Cheap, but it is calendar time on the critical path, so it is the first thing to ask, before any code.

### Why not the others — with the verification that decided it

- **Nuvem Fiscal: eliminated by fact, not by judgement.** Its own site carries the notice *"o serviço Nuvem Fiscal será desativado em 31/07/2026"* — verified on 2026-08-07. The free 1.000 dfe-eventos/month tier that made it the cheapest option on paper belongs to a service that shut down a week ago. This is worth more than one line of elimination: it is the concrete instance of the risk the seam exists for, and it is why the XML lives in our database rather than at a vendor URL.
- **Spedy: eliminated by what the integration asks for.** Its Stripe connector is configured by pasting Stripe's **Secret Key** into Spedy (verified on `lp.spedy.com.br/integracoes/stripe`, 2026-08-07). A Stripe secret key can create charges, issue refunds, read every customer and mutate every subscription. Handing that to the invoicing vendor to avoid writing a queue consumer inverts the entire privilege argument the billing spec is built on. This is not a price comparison; it is a capability one. (Their published annual plans — Essencial R$ 890/ano for 1.800 notas, Avançado R$ 1.890, Profissional R$ 2.490 — do not enter into it. Note also that these figures differ from the monthly ones in circulation, another reason not to quote second-hand prices.)
- **NFE.io:** a good API, roughly twice the entry price for a volume band ten times larger than needed; the only right-sized tier is annual-commitment.
- **eNotas:** the figures in circulation come from `enotass.com.br` — double "s" — which is not the official domain, and the official pricing page exposes no numbers. Also no evidence of a Stripe integration, and API access appears to start above the entry tier.
- **PlugNotas:** no retrievable pricing at all. Belongs in a request for quotes, not in a decision.
- **Emissor Nacional direct (gov.br):** free, manual, zero vendor risk. It is not the integration; **it is the fallback the system degrades to**, which is why `manual` is a real state in this design rather than an apology.

### The seam

One file defines the contract and contains no vendor:

```ts
// src/lib/nota/provider.ts
export interface NotaProvider {
  emitir(ref: string, input: NotaInput): Promise<NotaOutcome>;
  consultar(ref: string): Promise<NotaOutcome>;
  cancelar(ref: string, motivo: string): Promise<CancelOutcome>;
}

export type NotaOutcome =
  | { kind: 'emitida'; numero: string; codigoVerificacao: string | null;
      chaveAcesso: string | null; urlPdf: string | null; xml: string | null; issuedAt: Date }
  | { kind: 'processando' }                       // vendor accepted, prefeitura pending
  | { kind: 'rejeitada'; codigo: string; mensagem: string }  // a refusal we READ
  | { kind: 'desconhecida' }                      // ref not found at the vendor
  | { kind: 'indisponivel' };                     // we never got an answer
```

**Three verbs, because three is what the state machine needs.** A fourth would be the seam leaking.

**One adapter obligation that is not optional, and is the reason the derived ref works.** `emitir` may **never** return `rejeitada` for a refusal that means *this ref already has a document*. A duplicate-ref refusal is the opposite of a rejection: it is the vendor telling us a document exists. The adapter resolves it by calling `consultar(ref)` and returning that outcome — still three verbs, still one file that knows Focus's error codes. Without this rule the derived ref is actively dangerous: a duplicate-ref refusal mapped to `rejeitada` lands the row in `erro`, Rafael clicks **Tentar novamente**, `attempt` increments, a *new* ref is minted, and the vendor issues the second nota this whole design exists to prevent. Which Focus response carries that meaning is on the unverifiable list and is answered by the same homologação experiment as the ref question.

**The most important property of this type is that it can say "I do not know."** `indisponivel` — a timeout, a 502, a DNS failure — is a distinct arm from `rejeitada`, and an adapter that collapsed a timeout into a failure would produce duplicate notas the first time Focus was slow. `desconhecida` is the opposite and equally necessary: it is a *read* proving no document was created, and it is the only thing that may return a row to `pendente`.

`src/lib/nota/focus.ts` is the only file in the repository permitted to know Focus NFe's field names, base URLs, HTTP semantics or error codes. It uses `fetch`: **the Focus vendor has no SDK, so this subsystem adds no new package dependency of its own.**

**That sentence used to be written as though it closed the bare-specifier gap for the whole subsystem. It does not, and the correction is a real one.** The claim pass retrieves the Stripe invoice for `period_start` and `amount_paid`, and the refund pass calls `charges.retrieve(ch_…)`. So the nota queue depends on the `stripe` bare specifier — through billing's `src/lib/billing/stripe-client.ts`, now listed in the module table — and on `STRIPE_SECRET_KEY`. The bare-package gap (`tests/privilege-boundary.test.ts:53-59`, the `return null` on `:57`, verified) is therefore **open for the credential this subsystem actually uses**, and a credential rule covering only `FOCUS_NFE_TOKEN` would be strictly weaker than billing's, not stronger. See "The privilege boundary", which adopts the rule for both keys in one change rather than offering it.

## Architecture

### Migration numbering

A new file. `0000`–`0003` are never edited.

**It cannot hardcode a number, and that was a real finding rather than pedantry.** As originally written, all three unshipped specs — this one, the billing spec and the LGPD spec — specified a migration `0004` with different contents, and three specs cannot own one number. Both companion specs have since been corrected and now carry an identical "On the migration number" note; this paragraph is the third copy of that agreement. This one is generated by `npm run db:generate` **after** the billing migration exists, because this subsystem cannot run without billing's `stripe_event` table, and it takes whatever number `drizzle-kit` assigns at that moment. The plan must not hardcode a number, and whichever of billing and LGPD ships second must regenerate rather than rename.

### Schema

**New enum `nota_status`:** `pendente` | `bloqueada` | `enviando` | `processando` | `emitida` | `erro` | `cancelada` | `cancelamento_falhou` | `manual` | `dispensada`.

Ten arms is more than any other enum in this repo and each one has to earn it — see "The state machine", where each is defined by *what a human or a retry would do next*, which is the only test that justifies a state.

**New table `church_fiscal`** — one row per church, the live fiscal identity:

| Column | Type | Null | Purpose |
|---|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | no | |
| `church_id` | `uuid NOT NULL REFERENCES church(id) ON DELETE CASCADE` | no | **`UNIQUE`.** One fiscal identity per church, today. See below. |
| `cnpj` | `text NOT NULL` | no | 14 digits, no punctuation. Stored normalised so a lookup is an equality. |
| `razao_social` | `text NOT NULL` | no | The registered legal name from the cartão CNPJ. **Not** `church.name`. |
| `inscricao_municipal` | `text` | yes | Legitimately absent: an immune religious entity is often not municipally registered. The issuance code must send "não informado" rather than refusing. |
| `logradouro` | `text NOT NULL` | no | |
| `numero` | `text NOT NULL` | no | **Text, not integer** — "s/n" and "1234-A" are real addresses. |
| `complemento` | `text` | yes | |
| `bairro` | `text NOT NULL` | no | |
| `cep` | `text NOT NULL` | no | 8 digits, normalised. |
| `codigo_municipio` | `text NOT NULL` | no | The **IBGE 7-digit code**, text because it is an identifier with significant leading digits and never arithmetic. A city *name* is not sufficient for any NFS-e layout. |
| `uf` | `text NOT NULL` | no | Two letters. |
| `email_fiscal` | `text NOT NULL` | no | Where the document goes. **Deliberately not `admin_user.email`**, which is a login credential belonging to the secretary; the nota goes to whoever keeps the books. |
| `contato_fiscal` | `text` | yes | A named addressee for that e-mail. |
| `observacoes` | `text` | yes | Vendor-side notes ("CNPJ is the convenção's, confirmed by Pr. João 12/03"). |
| `verified_at` | `timestamptz` | yes | When Rafael last confirmed these against the cartão CNPJ. Displayed, never branched on. |
| `created_at` / `updated_at` | `timestamptz NOT NULL DEFAULT now()` | no | |

**Two fields the research asked for and this spec deliberately omits, with the trigger for adding them.** An immunity/regime flag for the taker: the church's immunity does not affect Rafael's ISS, no layout examined here was confirmed to carry a taker-condition field, and no evidence was found that municipalities designate immune religious entities as ISS retention agents. A column for a field we cannot name in a schema we have read is speculation. **Trigger to add it: the accountant says retention can apply, or a rejected nota names the field.** Inscrição estadual: not applicable to a service taker in any layout examined. Same trigger.

**Why `church_id` is `UNIQUE` today and what changes when it stops being.** Brazilian congregations are frequently *filiais* or *congregações* under a convenção that holds the single CNPJ, so one legal taker may eventually cover several `church` rows. That cannot be settled from tax law or from this codebase — it is settled by asking the first three churches. Modelling it now would be inventing a hierarchy nobody has confirmed. Modelling it as a **separate table** rather than columns on `church` is what makes the eventual change cheap: drop the unique index, add `church.fiscal_entity_id`, and the issuance code changes at one lookup. That is the whole reason the table exists as a table, stated so the next reader does not "simplify" it into `church`.

**New table `nota_fiscal`** — the ledger and the queue, one row per invoice:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `church_id` | `uuid REFERENCES church(id) ON DELETE SET NULL` | Nullable, and the `SET NULL` is deliberate — see below. |
| `stripe_invoice_id` | `text NOT NULL` | **`UNIQUE`. The idempotency key.** The whole "never two notas for one payment" guarantee is this index. |
| `stripe_event_id` | `text REFERENCES stripe_event(id) ON DELETE SET NULL` | Provenance: which ledger row produced this. |
| `competencia` | `date NOT NULL` | First day of the service month. Stored, never re-derived. |
| `valor_centavos` | `integer NOT NULL` | Integer centavos. Never a float, never a formatted string. |
| `status` | `nota_status NOT NULL DEFAULT 'pendente'` | |
| `provider` | `text NOT NULL` | `'focus'` or `'manual'`. Which seam produced the document. |
| `provider_ref` | `text NOT NULL` | **`UNIQUE`.** `nf-{stripe_invoice_id}-{attempt}`. Derived from Stripe, never from this row's `id`. See below. |
| `attempt` | `integer NOT NULL DEFAULT 1` | Incremented only by an explicit human retry out of `erro`. |
| `numero` | `text` | The nota's own number, once it exists. |
| `codigo_verificacao` | `text` | |
| `chave_acesso` | `text` | |
| `url_pdf` | `text` | A rendering, regenerable, not the legal artifact. |
| `xml` | `text` | **The document itself.** The legal artifact, held by us. |
| `tomador_cnpj` | `text` | Frozen at issuance — see below. |
| `tomador_razao_social` | `text` | Frozen at issuance. |
| `erro_codigo` / `erro_mensagem` | `text` | The last refusal we read. Also carries the `bloqueada` / `dispensada` reason code. |
| `cancelamento_motivo` | `text` | |
| `issued_at` / `cancelled_at` | `timestamptz` | |
| `last_attempt_at` | `timestamptz` | The queue cursor. Written **before** the vendor call. |
| `estorno_tratado_ate` | `timestamptz` | **The refund watermark.** `received_at` of the newest `charge.refunded` ledger row this nota has already been acted on for. Null means none. |
| `estorno_evento_id` | `text` | That row's `evt_…`. Provenance, and the tie-break that makes the watermark safe. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

**The ref is derived from Stripe, not from us — and the earlier draft's version of this was self-refuting.** That draft minted `nf-{uuid}-1` "with the uuid generated client-side", called it deterministic, and then claimed the vendor layer covers the case *our claim row is lost and the vendor already has the document*. A client-side uuid exists **only on the row**, so if the row is lost the ref is unrecoverable and both "independent" layers were really one layer: the row survived. The concrete failure is not exotic — a Neon incident, a restore from a backup taken before an `emitir` succeeded. `stripe_event` is durable by this spec's own argument, so the claim replays, mints a fresh uuid, Focus sees an unknown ref, and issues a **second nota for the same invoice**.

`nf-{stripe_invoice_id}-{attempt}` fixes it because every input is recoverable from Stripe alone. Three properties follow, and each is load-bearing somewhere else in this document:

- **A lost row reconstructs the same ref.** The vendor refuses (or returns) the existing document under it, and the adapter rule above turns that into a `consultar`, not an `erro`.
- **The attempt sequence replays in order.** If the lost row was on `attempt = 2`, the restore starts again at `nf-{invoice}-1` — the ref of the *rejected* first attempt. The vendor refuses it, we read the refusal, a human retries, `attempt` becomes 2, and we arrive at the ref that may actually hold a document. The walk converges on the real document instead of stepping past it.
- **Returning a row to `pendente` is safe.** `desconhecida` does not increment `attempt`, so the re-send carries the *same* ref. This is what lets the settle pass be wrong about `desconhecida` without producing a duplicate — see the threshold discussion in "The state machine" and in "4 · Settle".

Two vendor properties this rests on are unverified and listed as such: the maximum length and permitted character set of a Focus `ref` (Stripe ids are `[A-Za-z0-9_]`, and `nf-` + an `in_…` is roughly 32 characters), and which Focus response means "this ref already has a document". **If the length limit refuses the derived form, the fallback is a hash of the invoice id — the first 16 hex characters of `sha256(stripe_invoice_id)` plus the attempt — which is still reconstructible from Stripe alone. Truncating the invoice id is not an option: it reintroduces collisions, which is a worse failure than the one being solved.**

**Why the refund watermark is a timestamp plus an event id and not a boolean.** `stripe_event` is a durable ledger and nothing in billing records that the *nota* subsystem consumed a `charge.refunded` row — billing's `processed_at` means billing finished with it. Without a marker on our side, every refund is re-detected every hour forever: the arms that change no state (`manual` flagged for Rafael, a partial refund recorded and flagged, `cancelamento_falhou`) would re-flag hourly, which trains Rafael to ignore the queue and is exactly the failure the `manual` state was invented to avoid. A boolean cannot work either, because a partial refund can be followed by a full one and a single "handled" flag would swallow the second. The watermark is compared as a row value — `(ev.received_at, ev.id) > (nf.estorno_tratado_ate, nf.estorno_evento_id)` — so a later refund event is always selected and an already-handled one never is. The tie-break on `id` is not decoration: with a bare `>` on the timestamp alone, two refund events sharing a `received_at` would leave the second **permanently unprocessed**, a missed refund that reports nothing.

**Why the taker identity is frozen onto the row and not read back through the join.** A nota issued in March against CNPJ X must keep saying X even after the church corrects its CNPJ in May. Reading through `church_fiscal` at display time would rewrite history and would make "what did we actually send?" unanswerable without the vendor. Two columns, not the whole address: the address is in the stored `xml`, and duplicating it into typed columns creates a second address ledger that can drift from the document it claims to describe.

**Why `ON DELETE SET NULL`, matching billing's one deliberate exception.** Every other child table cascades and `tests/tenant-isolation.test.ts` asserts that deleting church A removes all of A. `nota_fiscal` is the exception for the same reason `stripe_event` is: it holds no member data, it is the vendor's own fiscal record, and Rafael is legally required to retain it *after* the church leaves. `church_fiscal`, by contrast, **cascades** — it is the live identity, not the historical document, and there is no reason to keep a departed church's address. The migration must be accompanied by explicit assertions in the isolation suite for both halves, so the exception and the non-exception are each tested rather than discovered.

There is no personal-data problem in the surviving row: a CNPJ and a razão social are a corporate identity, not a member's data, and the document is one Rafael must keep.

**New table `nota_run`** — a one-row heartbeat:

```sql
CREATE TABLE nota_run (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at timestamptz NOT NULL,
  last_result text
);
```

**Why a table for a timestamp.** Billing can infer scheduler liveness from `stripe_synced_at` per church, because a billable church always exists. The nota queue can legitimately be **empty** — no payments this week — and an empty queue and a dead cron look identical from every column in `nota_fiscal`. Without a heartbeat, "the fiscal queue stopped running" is invisible until the 5th of a month, which is exactly the failure this document exists to prevent. One `INSERT … ON CONFLICT (id) DO UPDATE` per run, one warning in `/owner`.

**Indexes:**

```
church_fiscal_church_id_uq        UNIQUE (church_id)
nota_fiscal_stripe_invoice_uq     UNIQUE (stripe_invoice_id)
nota_fiscal_provider_ref_uq       UNIQUE (provider_ref)
nota_fiscal_status_idx            (status)                        -- the queue
nota_fiscal_church_comp_idx       (church_id, competencia DESC)   -- the per-church list
stripe_event_type_processed_idx   (type, processed_at)            -- the claim and refund sweeps
```

**The last index is on billing's table, and that is stated rather than smuggled.** The claim and refund sweeps filter `stripe_event` on `type` and `processed_at`; billing indexes only `(church_id, received_at DESC)` and `(outcome)` (billing spec `:113`, verified). At today's volume a sequential scan is free, but the ledger grows monotonically and these queries run every hour forever, so the index is created **in this subsystem's migration** — it is added for this subsystem's queries and is this subsystem's to maintain. Whoever reviews billing's schema should know it exists.

**The tempting wrong constraint is `UNIQUE (church_id, competencia)`.** "One nota per church per month" reads right and is wrong: a plan change, a proration, or a re-charge after a failure can put two legitimate invoices in one competência, and a cancelled-then-reissued document would collide with itself. The uniqueness that is actually true is **one nota per Stripe invoice**, and that is the index.

### Components, one responsibility each

| Module | Responsibility | May be imported by |
|---|---|---|
| `src/lib/nota/prazo.ts` | **Pure.** `competenciaFrom(periodStart: Date)`, `notaDeadline(competencia)`, `notaUrgency(competencia, now)`. No I/O, no database. Mirrors `church-status.ts`. | anyone |
| `src/lib/nota/provider.ts` | The interface and its types. No vendor, no I/O. | anyone |
| `src/lib/nota/focus.ts` | The **only** file that knows Focus NFe. `fetch`, field mapping, error-code translation. | **owner zone only** |
| `src/lib/nota/payload.ts` | Turns `church_fiscal` + `nota_fiscal` + vendor config into a `NotaInput`, or returns a named refusal. Pure given its inputs. | **owner zone only** |
| `src/lib/nota/servico.ts` | The descrição do serviço constant and the `DESCRICAO_APROVADA` gate. Pure, no I/O, reviewed in a diff. | **owner zone only** |
| `src/lib/nota/queue.ts` | The four passes: claim, refund, issue, settle. Ordered, capped, resumable. | **owner zone only** |
| `src/lib/billing/stripe-client.ts` | **Billing's, not ours — declared here because we import it.** The claim pass retrieves the invoice; the refund pass retrieves the charge. This is the subsystem's dependency on the `stripe` bare specifier and on `STRIPE_SECRET_KEY`, and it is the reason the credential rule below covers both keys. | **owner zone only** (billing's own rule, unchanged) |
| `src/lib/repo/nota.ts` | Cross-church reads and every write to `nota_fiscal` / `church_fiscal` / `nota_run`. | **owner zone only** |
| `src/lib/repo/nota-church.ts` | The **only** nota surface church-facing code may reach. Takes **no tenant identifier**; resolves the church from the session itself. Returns issued documents only. | anyone |
| `src/app/api/nota/processar/route.ts` | `CRON_SECRET` guard, `maxDuration`, call the queue. | — |
| `src/app/owner/(protected)/notas/` | The platform-wide fiscal queue. | — |
| `src/app/owner/(protected)/[churchId]/DadosFiscaisCard.tsx` + actions | Capture and correction. | — |
| `scripts/nota-processar.ts`, wired as `"nota:processar"` | Operator CLI for when the app is the suspect. English output is fine here. | — |

**`nota-church.ts` copies `stripe-portal.ts`'s revision-3 shape exactly, including the part that was learned the hard way.** It takes no church id. It calls `requireReadableSession()` (`src/lib/auth/writable.ts:75-84`) and reads only rows whose `church_id` matches, and it selects only `competencia`, `numero`, `valor_centavos`, `url_pdf` and `status IN ('emitida','manual','cancelada')`. There is no argument a caller can substitute, which is what lets the "may be imported by" column honestly say *anyone*. It **may not import anything under `src/lib/nota/`** — it is a read of our own table, not a path to the vendor.

**It deliberately does not expose `erro`, `bloqueada` or `pendente` rows to the church.** Showing a church "sua nota falhou" invites them to chase Rafael about a problem only Rafael can fix, and when the cause is missing fiscal data the fix is data he must collect anyway. The one thing the church *is* told is that its fiscal data is missing, because that is the one thing the church can act on.

### The privilege boundary

Everything that can issue a fiscal document, or that holds the vendor's credential, is owner-only.

```
OWNER_ONLY += { src/lib/nota/focus.ts, src/lib/nota/payload.ts, src/lib/nota/servico.ts,
                src/lib/nota/queue.ts, src/lib/repo/nota.ts }
OWNER_ZONE += { src/app/api/nota/**, src/lib/nota/** minus prazo.ts and provider.ts }
```

**`src/lib/nota/**` has to join the owner *zone*, not only the owner-only set, and that is a consequence of the module table above rather than a tidy-up.** `queue.ts` imports `src/lib/billing/stripe-client.ts`, which billing restricts to importers in the owner zone. If the nota modules were owner-*only* without also being inside the zone, billing's own rule would refuse the import that this subsystem's claim pass is built on — the suite would go red for a correct design, and the likely "fix" under deadline pressure is to widen billing's rule instead of the zone. Naming it here is cheaper than discovering it.

`src/lib/nota/prazo.ts`, `src/lib/nota/provider.ts` and `src/lib/repo/nota-church.ts` are deliberately outside the owner-only set: a pure date rule, a type declaration, and a session-scoped read of our own table carry no cross-church capability.

**The bare-package gap, and what actually closes it for this subsystem.** `resolveSpecifier` returns `null` for bare specifiers (`tests/privilege-boundary.test.ts:53-59`, the `return null` on `:57` — verified), so a church-facing file that imports a vendor SDK directly is invisible to every resolution-based rule. Billing answers this with a **text rule on the specifier `stripe`**.

An earlier draft of this section said that answer "does not transfer here, because Focus NFe has no SDK", and drew from that the conclusion that the credential rule below is *strictly stronger* than billing's. **The first clause is true and the conclusion was false.** There is indeed no Focus package to forbid — but this subsystem reads Stripe (claim pass, refund pass) through `src/lib/billing/stripe-client.ts`, so it depends on the `stripe` bare specifier and on `STRIPE_SECRET_KEY`. A credential rule naming only `FOCUS_NFE_TOKEN` while declining to name `STRIPE_SECRET_KEY` is strictly **weaker** for the credential this subsystem actually uses, and calling that "keeping its own scope honest" had it backwards: the scope already includes Stripe.

So the rule is **credential-name based and adopted for both keys in this change**, not offered for a later one: the strings `FOCUS_NFE_TOKEN`, `NOTA_*`, the Focus base URL **and `STRIPE_SECRET_KEY`** may appear only inside the owner zone. A bare import without the credential is inert; a bare import *with* the credential is the whole attack. It sits **beside** billing's `stripe` specifier rule rather than replacing it — the two catch different halves (a church-facing file that imports the SDK but reads the key from a helper; a church-facing file that reads the key but never names the package), and dropping either because the other exists is how a boundary quietly narrows.

**Three specs are amending one test file, and that must be reconciled by whoever ships second.** Billing proposes `SCAN_ROOTS` / `OWNER_ONLY` / `OWNER_ZONE` sets plus removing the `!ALLOWED.has(full)` skip on `:45`; LGPD proposes an importer-keyed `RESTRICTED` map and the same removal. **Adopt LGPD's map** — it subsumes billing's sets (an owner-only module is a key whose value is the owner zone; `platform.ts` is a key whose value is the empty set) and it is the shape that does not need a fourth mechanism when a fifth restricted module appears. This spec's contribution is four keys and one text rule.

The implementation must inject violations and watch each go red before the change is trusted, per billing's discipline: an import of `src/lib/nota/focus.ts` from `src/app/api/whatsapp/webhook/route.ts`, and a literal `process.env.FOCUS_NFE_TOKEN` in `src/lib/repo/nota-church.ts`. The second is the interesting one — it is the file most likely to be "helpfully" extended next year.

## The trigger: what we consume from billing

The nota subsystem has **no webhook**. One Stripe endpoint exists in this product and it belongs to billing.

### The contract, stated precisely

We depend on exactly four properties of the billing design, all of which it already has or is asked for below:

1. **`stripe_event` rows exist for `invoice.paid`**, resolved to a church, with `outcome = 'recorded'`, `processed_at IS NOT NULL`, `church_id` set, and `stripe_object_id` holding the `in_…`.
2. **`church.stripe_customer_id` and `stripe_subscription_id` are unique**, so "which church" is never ambiguous.
3. **`stripe_event` survives church deletion** (`ON DELETE SET NULL`), so a nota's provenance outlives the tenant.
4. **`stripe_event` is a durable ledger, not a stream.** The claim step is a query against it, re-run every hour.

Property 4 is the one that pays for choosing the ledger over the wire. An event billing records as `unmatched` today and a human binds to a church next Tuesday becomes a claimable nota on the next pass, with no replay machinery and no code that knows about the repair. **We do not consume `church.status`** — a nota is owed for a payment that succeeded, even if the church has since been suspended.

### The one line billing has to add

Billing's handled-event set gains **`invoice.paid`**: resolve the church from `invoice.customer` → `stripe_customer_id`, write the `stripe_event` row with `outcome = 'recorded'`, and **touch no column of `church`, `stripe_synced_at` included**.

That is the entire change. It adds no column, no outcome, and no code path billing does not already have twice — it is character-for-character the discipline billing already applies to `charge.refunded` and `charge.dispute.created`, and it obeys billing's own central rule, that edges never drive status. `invoice.paid` *is* an edge; that is precisely why billing declined to map it to status and precisely why the nota subsystem needs it.

The one non-code consequence: the Stripe dashboard endpoint goes from six configured event types to seven, and billing's spec lists that configuration as part of "done".

### Refunds

Refunds arrive as `charge.refunded` rows, which billing already records. A Charge names an `invoice`, not the other way round, so the nota subsystem does its own `charges.retrieve(ch_…)` to get the `in_…` and then looks up `nota_fiscal` by `stripe_invoice_id`. That is a nota-side Stripe read; it asks nothing new of billing.

**It does, however, mean this subsystem holds `STRIPE_SECRET_KEY` — this read and the claim pass's `invoices.retrieve` are the two places it does.** Both go through `src/lib/billing/stripe-client.ts`, which is why that module appears in this spec's component table and why the credential rule below covers Stripe's key as well as Focus's. Neither value can come from `stripe_event` instead: billing deliberately stores no payload and no `amount` column, and that decision is right for billing.

**Billing's `processed_at` does not mean the nota subsystem is finished with a refund row** — it means billing is. Our own consumption marker is the watermark on `nota_fiscal`; see "Cancellation and refund".

## The state machine

Each state is defined by **what happens next**, which is the only thing that justifies a state existing.

| State | Meaning | What moves it |
|---|---|---|
| `pendente` | Claimed. Nothing has been sent. | The issue pass claims it → `enviando`. |
| `bloqueada` | Cannot be built: fiscal data missing or unusable. **A retry cannot help; only a human can.** | Saving `church_fiscal` releases that church's rows blocked **for `dados_incompletos` only** → `pendente`. Rows blocked for `moeda_invalida` or `igreja_removida` are deliberately left blocked, because saving a CNPJ does not make a USD invoice billable in reais or bring a deleted church back. |
| `enviando` | A send began and **we have not read its result.** | **Never re-sent.** The settle pass calls `consultar(ref)`: `emitida` → `emitida`; `processando` → `processando`; `rejeitada` → `erro`; `desconhecida` → back to `pendente`; `indisponivel` → stays. |
| `processando` | The vendor accepted it; the prefeitura has not answered. | The settle pass polls `consultar(ref)`. |
| `emitida` | Done. Number, XML, PDF recorded. | A full refund → cancellation attempt. |
| `erro` | **A refusal we read.** No document exists. | A human fixes the data and clicks retry, which increments `attempt`, mints a new `provider_ref`, and returns it to `pendente` — in one statement. |
| `cancelada` | Issued, then cancelled at the vendor's confirmation. | Terminal. |
| `cancelamento_falhou` | Cancellation attempted and refused — usually the municipal window closed. | Terminal for the machine. **Alerts loudly**; the resolution is a phone call to the accountant. |
| `manual` | Rafael issued it in the Emissor Nacional or the prefeitura and recorded the number. | Terminal. |
| `dispensada` | Deliberately no nota: zero-value invoice, refunded before we issued, or an un-issued row whose church was deleted and dispensed by hand. | Terminal. Recorded as a row so the decision is visible rather than being an absence. |

**The invariant that makes duplicates impossible: `erro` is only ever written from a response we read.** A response we did not read leaves the row in `enviando`. There is **no path from `enviando` to `pendente` except `desconhecida`** — a positive statement by the vendor that the ref does not exist. No timeout, no age, no operator button may move a row out of `enviando` by assumption. This is the sentence to defend in review.

**The age gate in the settle pass does not contradict that sentence, and the earlier draft failed to say why.** That draft stated the invariant absolutely, then had the settle pass select `enviando` rows "older than a few minutes" — an unspecified number doing exactly the job the invariant forbids, on a vendor property nobody had checked. Two corrections, and they are separable:

- **The threshold governs *when we ask*, never *what we conclude*.** `NOTA_SETTLE_DELAY` is a named constant, **5 minutes** to start, and it is a politeness margin on the vendor's indexing lag, not evidence about the document. A row below the threshold is simply not selected this pass; the next pass asks. Nothing about the age is ever written to the row, and no age ever produces a state change.
- **`desconhecida` is only proof if Focus does not return not-found for an in-flight ref.** The earlier draft's unverifiable list asked whether a rejected ref can be reused, but never asked the question the design actually rests on. It is now on the list, and it is the *first* homologação experiment, not the last.

**And if that experiment comes back badly, the design survives — because of the derived ref.** Suppose Focus does return not-found for a ref submitted seconds ago and our threshold is too short. The row goes `enviando → pendente`, and the re-send carries **the same `provider_ref`**, because `desconhecida` does not increment `attempt`. The vendor's own uniqueness on that ref then refuses the second issuance, and the adapter rule turns that refusal into a `consultar`. A wrong `desconhecida` costs one wasted call, not a duplicate document. This is the concrete payoff of finding-1's fix, and it is why the threshold can be a starting number rather than a researched one — but the experiment still has to be run, because a wrong `desconhecida` that the vendor *did not* deduplicate would be a duplicate nota.

**Why `enviando` and `processando` are two states and not one.** They differ in what the recovery does and in what a failure means. `enviando` means *we do not know whether the vendor received it* — the recovery is a lookup that may return `desconhecida`. `processando` means *the vendor confirmed receipt* — `desconhecida` from that state would be a vendor bug, not a normal outcome, and should be surfaced as one. Merging them would make the queue treat "possibly never sent" and "definitely sent, awaiting the prefeitura" identically.

**Why a retry out of `erro` may mint a new ref without weakening anything.** A rejected ref is consumed at the vendor: asking again returns the same rejection forever. But the guarantee this document makes is not "one ref per invoice" — it is **one nota per invoice**, enforced by `nota_fiscal_stripe_invoice_uq`. A new ref is only ever minted from a state that, by the invariant above, is known to have produced no fiscal document. Old refs stay reconstructible as `nf-{stripe_invoice_id}-{n}` for any `n < attempt` **from Stripe alone**, so no history column is needed and a restored database can still walk the sequence.

**The one input that must never reach this path is a duplicate-ref refusal.** It arrives looking like a rejection and means the opposite. The adapter, not the state machine, is where that is caught — see "The seam" — because the state machine cannot tell one vendor error code from another and should not learn to.

## The issuing passes

`POST /api/nota/processar`, `CRON_SECRET`-guarded, `export const maxDuration = 60`. **Hourly**, not daily.

**Why hourly, when billing reconciles daily.** Billing's clock is a 7-day grace period; a day of latency is nothing. This clock is the placeholder deadline, and the *correction* window after a wrong issuance is shorter still. A nota that first fails at 23:00 on the 31st has roughly 120 automatic attempts before the placeholder deadline at hourly cadence, and five at daily. The cost is about 24 no-op queries a day at this volume.

**Hourly is a hosting-plan requirement, not a line in a config file, and "done" includes the plan.** The repo has no `vercel.json` today (verified: `ls vercel.json` fails; billing spec `:618` says it creates the first one), so the cron entry joins billing's daily one in a file billing introduces. But a schedule in `vercel.json` is a *request*: **Vercel's lower plan tiers coarsen cron triggers to roughly once per day regardless of the expression written**, which would silently reduce the 120 attempts above to about five and delete the entire justification for this cadence. The exact current limits are a vendor fact this spec has not verified and must not assert — **confirming them, and being on a plan that honours a sub-daily schedule, is a launch prerequisite listed under "Vendor and legal configuration".**

If the answer is that hourly is unavailable, the degraded mode is stated rather than discovered: the cadence becomes daily, `nota_run` still exposes it, and the two manual triggers that already exist — the **Processar fila agora** button in `/owner` and `npm run nota:processar` — become load-bearing rather than diagnostic. That is a materially worse deadline story and Rafael should choose it knowingly.

Four passes per run, in order, each bounded and each resumable.

**The order is claim → refund → issue → settle, and pass 2 moved there to close a real hole.** An earlier draft ran claim → issue → settle with refunds handled inside settle, while asserting in the cancellation section that we "never issue a nota for a payment that was already refunded". Those two statements cannot both be true: an invoice paid and refunded inside one hourly window is claimed `pendente` in pass 1, **issued in pass 2**, and only then does pass 3 discover the refund — forcing a cancellation inside a municipal window minutes after issuance, which is the most expensive outcome this document has. Sweeping refunds before the issue pass makes the guarantee real for every refund visible when the run starts.

**The residual window, stated rather than glossed.** A refund that arrives *during* a run, after the refund pass has passed the row, is still issued. That window is one pass instead of one hour, and it lands on the `emitida` → `cancelar` path, which is the path that exists for exactly this. The guarantee is therefore "never issue against a refund we can see", not "never issue against a refund", and it is written that way below.

### 1 · Claim

For each `stripe_event` row of type `invoice.paid` with `church_id IS NOT NULL`, `processed_at IS NOT NULL`, and no `nota_fiscal` row for its `stripe_object_id`:

1. Retrieve the invoice from Stripe. Read the **subscription line item's `period_start`**, convert it to America/São_Paulo, take the first day of that month as `competencia`. Read `amount_paid` and `currency`.
2. One statement:

```sql
INSERT INTO nota_fiscal (church_id, stripe_invoice_id, stripe_event_id,
                         competencia, valor_centavos, provider, provider_ref, status)
VALUES ($church, $invoice, $event, $competencia, $valor, 'focus', $ref, $status)
ON CONFLICT (stripe_invoice_id) DO NOTHING
```

`$ref` is `nf-{stripe_invoice_id}-1`, computed from the invoice id the query already has — **never a uuid**, so a lost row reconstructs the same ref. `$status` is `dispensada` when `amount_paid = 0`, `bloqueada` with `erro_codigo = 'moeda_invalida'` when `currency <> 'brl'`, and `pendente` otherwise, each with its reason in `erro_codigo`.

**There is no window in which a nota is issued but unclaimed**, because issuance is gated on a claimed row and the claim is one statement with a unique index behind it. A crash before the insert loses nothing at all — the `stripe_event` row is the durable trigger and the next pass re-runs the same query. A crash after it leaves a `pendente` row, which is exactly what the next pass drains.

**The timezone conversion is not a detail.** `period_start` is a Unix timestamp. A payment at 02:00 UTC on 1 February is 23:00 on 31 January in São Paulo, and computing the competência in UTC would file it under the wrong month, in the wrong deadline window, in the wrong PGDAS-D period. `competenciaFrom` is pure and gets its own boundary tests.

**A zero-value invoice records a `dispensada` row rather than skipping.** Whether a nota is owed for a zero-value service is contested and is on the accountant's list; recording the decision as a visible row is how it gets revisited, and silently skipping is how it never does.

### 2 · Refund

Full detail is in "Cancellation and refund"; what belongs here is its place in the order and its selection. Select `charge.refunded` rows from `stripe_event` whose charge resolves to a `nota_fiscal` row that has **not already been acted on for that event** — the watermark comparison `(ev.received_at, ev.id) > (nf.estorno_tratado_ate, nf.estorno_evento_id)`, with a null watermark matching everything. Apply the action table by the nota's state. Every arm that reaches a decision writes the watermark **in the same statement as the state change**, so a refund is consumed exactly once; the two arms that deliberately defer (`enviando`, `processando`) write nothing at all and are re-selected next pass, which is correct because the row will have settled by then.

A `charge.refunded` whose invoice has **no** `nota_fiscal` row is a no-op with no watermark to write, so it is re-queried every hour. That is deliberate and it is not an alert: it is the case where billing has not yet bound the event to a church, and it means the refund is still waiting when the claim pass finally creates the row. One indexed query an hour is the price of not needing replay machinery for that repair.

### 3 · Issue

**Before selecting anything, the pass checks `DESCRICAO_APROVADA` in `src/lib/nota/servico.ts`. While it is `false`, the pass does no work at all** and records the reason in `nota_run.last_result`, which `/owner` shows as a banner at the top of the queue. Rows stay `pendente` and keep accruing visible deadline pressure. See "On the nota itself" for why this gate sits here rather than in the payload builder.

Select `pendente` rows, `ORDER BY last_attempt_at ASC NULLS FIRST, id ASC`, capped at `NOTA_BATCH`. The ordering and cap reasoning is billing's, unchanged and not re-derived here: an unordered uncapped walk that dies on a timeout dies at the same place every run, so its tail is never processed at all.

Per row:

```sql
UPDATE nota_fiscal
   SET status = 'enviando', last_attempt_at = now()
 WHERE id = $1 AND status = 'pendente'
RETURNING id
```

Zero rows returned means another lambda claimed it; skip. **This is the one place the nota subsystem is stricter than billing, and the reason is worth stating**: billing's attempt marker is a separate statement carrying no invariant, because its redundant work is an idempotent `UPDATE`. Here the marker *is* the mutual exclusion, because the redundant work is a fiscal document. One statement, conditional on the current state, doing both jobs.

Then, outside the database: build the payload from `church_fiscal` and vendor config. If it cannot be built — no `church_fiscal` row, a required field empty, a malformed CNPJ — one statement moves the row to `bloqueada` with the reason **and the vendor is never called.**

Then `emitir(ref, input)`, and one statement records the outcome by its arm: `emitida` → `emitida` with `numero`, `codigo_verificacao`, `chave_acesso`, `url_pdf`, `xml`, `issued_at`, `tomador_cnpj`, `tomador_razao_social`; `processando` → `processando`; `rejeitada` → `erro` with code and message; `indisponivel` → **no write at all**, the row stays `enviando` and pass 3 owns it from here.

### 4 · Settle

Select `enviando` rows older than **`NOTA_SETTLE_DELAY`, a named constant, 5 minutes to start**, plus all `processando` rows, same ordering and cap. Call `consultar(ref)` and apply the state table. **`consultar` is a read; it can be called any number of times.**

The threshold decides *when we ask*, never *what we conclude* — the reasoning, the vendor property it depends on, and why a wrong answer costs a call rather than a document are in "The state machine". The number itself is a starting point to be measured in homologação, not a researched value, and it is on the infrastructure line of the unverifiable list with `NOTA_BATCH`.

Then the heartbeat, one statement:

```sql
INSERT INTO nota_run (id, last_run_at, last_result) VALUES (1, now(), $summary)
ON CONFLICT (id) DO UPDATE SET last_run_at = now(), last_result = $summary
```

Every per-row failure is caught per row and the walk continues. One church that cannot be reached must not end the run for the rest of the page.

### No transactions — the three consequences

**Claim-then-crash** is free here, unlike in billing: the trigger (`stripe_event`) is durable and independent of the claim, so a lost claim is simply re-derived next hour.

**Send-then-crash** is the real one, and it is handled by state rather than by hope. The `pendente → enviando` transition commits *before* the vendor call, so a crash anywhere after it leaves a row that is known-uncertain and is resolved by asking. The alternative designs both fail: marking after the call loses the fact that a send happened, and marking with a timeout that reverts to `pendente` re-sends a document that may exist.

**Two ids at once** never arises — every write in this subsystem is a single-row `UPDATE` on `nota_fiscal` or a single `INSERT`. Nothing here binds two external identities in one operation the way billing's apply statement does.

**Every state-changing write is conditional on the state it expects, with `RETURNING`, and zero rows is a refusal rather than a surprise.** This is the discipline the earlier draft applied to the issue pass and then dropped for the two writes that can actually create a duplicate nota. Without transactions there is no such thing as "check the status, then write" — the check and the write are two statements and the queue runs between them. The rule is therefore mechanical and there are no exceptions:

| Write | Guard | Zero rows means |
|---|---|---|
| Claim | `ON CONFLICT (stripe_invoice_id) DO NOTHING` | Already claimed. |
| `pendente → enviando` | `AND status = 'pendente'` | Another lambda has it. |
| Outcome writes | `AND status = 'enviando'` (or `'processando'` for the settle arms) | The row moved; re-read and let the next pass own it. |
| Retry from `erro` | `AND status = 'erro'` | Refuse, verbatim pt-BR. |
| Release on save | `AND status = 'bloqueada' AND erro_codigo = 'dados_incompletos'` | Nothing to release; the count is what the message prints. |
| **Manual registration** | `AND status IN ('pendente','bloqueada','erro')` | **Refuse, verbatim pt-BR.** |
| **Refund → `dispensada`** | `AND status IN ('pendente','bloqueada')` | Do nothing this pass; no watermark; re-evaluated next pass. |
| **Refund → other arms** | the arm's own state, plus the watermark in the same `SET` | Already handled, or the row moved. |

The last three are the ones this revision added. Their tests are concurrency tests — two simultaneous calls, exactly one wins — not behavioural ones, because a behavioural test passes against read-check-then-write code and proves nothing about the failure that matters.

## Tax data: collected where, by whom, and what happens when it is missing

**A church that pays before supplying its CNPJ is the normal case.** Rafael provisions a church, connects its number, generates a Checkout link, and the first charge lands days before anyone thinks about the cartão CNPJ. The design assumes this rather than tolerating it.

**Collection** is a **Dados fiscais** card on `/owner/[churchId]`, owner-only, typed by Rafael from the church's cartão CNPJ. Validation is client-and-server: CNPJ exactly 14 digits after stripping punctuation, CEP exactly 8, IBGE code exactly 7, UF two letters, a syntactically valid e-mail. One extra check that is not cosmetic: **the fiscal e-mail is refused if it equals any `admin_user.email` for that church**, with a message saying why. A fiscal document sent to a login address is wrong on both fiscal and LGPD grounds, and it is the mistake that will be made.

`provisionChurch` is **not** changed. Requiring fiscal data at creation would block Rafael from provisioning before the CNPJ card exists, which is the wrong order. The cost of that choice — a church quietly missing fiscal data — is paid off in the church list, which shows a **Sem dados fiscais** badge from the day the church is created, not from the day its first payment lands.

**When a payment lands and the data is missing**, the claim still happens. The row exists, with the right competência, the right amount and the right invoice id, in `bloqueada`. It is in the queue with a visible deadline. Nothing is lost and nothing has to be reconstructed later from Stripe.

**When the data arrives**, the save action releases the backlog in one statement:

```sql
UPDATE nota_fiscal
   SET status = 'pendente', erro_codigo = NULL, erro_mensagem = NULL
 WHERE church_id = $1 AND status = 'bloqueada' AND erro_codigo = 'dados_incompletos'
RETURNING id
```

The `RETURNING` is what the confirmation message counts. The rows drain on the next hourly pass, each keeping its own competência — so a church that supplies its CNPJ in month three gets three notas for three months, correctly dated.

**And those three notas are late, which this document will not pretend is free.** A nota for a closed competência may be refused outright, or accepted with a penalty, depending on Rafael's municipality — and that is precisely the number on the unverifiable list. So the queue does not show blocked rows as a neutral backlog: it shows each one's age against `notaDeadline(competencia)` and escalates the copy through three levels, with the overdue level naming the accountant. The honest position is that automation cannot fix a competência that has closed; it can only make sure nobody discovers it in April.

**When the data is wrong**, the vendor rejects, the row lands in `erro` with the vendor's own message, Rafael corrects the card, and clicks **Tentar novamente** — which mints a new ref. The button carries a warning that it does so, because clicking it before fixing anything just consumes another ref.

## Cancellation and refund

The clock here is shorter than the issuance clock and that is what shapes the whole section. Correction and cancellation windows are municipal and tight — SP allows substitution for a limited period that cannot cross the ISSQN due date for the competência; one municipal rule found allows 10 days subject to that same cap. **A wrong nota is cheaply fixable for days, not weeks.**

A `charge.refunded` row in `stripe_event` is picked up by **pass 2, which runs before the issue pass** (see "The issuing passes" for why that ordering is load-bearing). The charge is retrieved to find its `invoice`, and the nota is found by `stripe_invoice_id`. Then, by the nota's state:

| Nota state | Action | Writes the watermark? |
|---|---|---|
| `emitida` | Attempt `cancelar(ref, motivo)`. Confirmed → `cancelada`. Refused → **`cancelamento_falhou`**, top of the queue, copy that names the prazo and tells Rafael to call the accountant. | Yes, with the outcome. |
| `pendente` / `bloqueada` | → `dispensada`, reason `estornada`. **Never issue a nota for a refund we can see.** | Yes, in the same statement. |
| `enviando` / `processando` | **Do nothing yet.** Settle it first, then cancel on the following pass. Cancelling a document that may not exist is how one problem becomes two. | **No** — deliberately, so it is re-selected next pass. |
| `erro` / `dispensada` / `cancelada` | Nothing to cancel. Recorded. | Yes. |
| `cancelamento_falhou` | **Nothing.** Already terminal, already alerting loudly, already Rafael's phone call. The vendor is **not** called again — a cancellation the prefeitura refused does not become acceptable by being asked hourly, and a re-attempt would only replace one refusal message with an identical one. | Yes. |
| `manual` | **Flagged for Rafael, never automated**, reason `estorno_manual`. We did not issue it, we do not know where it lives, and we must not claim to have cancelled it. | Yes — the flag is raised once, not every hour. |

**`cancelamento_falhou` was missing from this table entirely in the earlier draft**, which left it ambiguous between two bad readings: re-attempt the cancellation against the vendor every hour forever, or skip it silently. It is now an explicit no-vendor-call arm that consumes the refund event, and the row keeps its position at the top of the queue on its own state, not on repeated detection.

**The watermark column is what makes the no-state-change arms survivable.** `emitida → cancelada` self-limits because the state moves. `manual`, `cancelamento_falhou` and a partial refund change no state, so without a marker each would be re-detected and re-flagged on every hourly run forever — a permanently red row for a decision Rafael already made, which is precisely the "trains him to ignore the queue" failure the `manual` state exists to prevent. The write is `SET erro_codigo = $reason, estorno_tratado_ate = $ev_received_at, estorno_evento_id = $ev_id WHERE id = $1 AND status = $expected`, one statement, and the watermark never advances without the decision it records.

**A partial refund never cancels anything.** The correct instrument is a substituting nota at the reduced value, which is a different operation with its own window and its own service-code implications. It is recorded with reason `estorno_parcial`, the watermark advances, and it is flagged for a human; the reasoning is on the accountant's list. **The row stays in the state it was in** — an `emitida` row remains `emitida`, because the document it names is still valid — so the church-facing list is unchanged and correct, and the flag shows only in `/owner`. The queue gains a **sinalizada** band for rows carrying a flag in a non-error state, so a flagged `emitida` row is visible rather than collapsed into "Everything issued".

**A dispute triggers nothing.** Billing records `charge.dispute.created` passively and this subsystem inherits that — and deliberately does *not* inherit it for refunds. The divergence is the point: a dispute may resolve in Rafael's favour and the money may never leave, so cancelling a valid nota on the strength of one is an unforced error with a window that will not reopen. A refund is settled fact.

## The owner console

**A platform-wide `/owner/notas` page**, not only a per-church card. The queue crosses churches and is Rafael's daily work; a per-church-only view means visiting every church to find the one that failed.

Rows are ordered by urgency, not by date:

1. `cancelamento_falhou` — the window has already closed.
2. `erro` — needs a data fix.
3. **Órfãs** — un-issued rows whose church was deleted. They can never drain by themselves; see below.
4. **Sinalizadas** — rows carrying a refund flag in a non-error state (`estorno_parcial`, `estorno_manual`). They are not broken, but they are a decision waiting on Rafael, and the "everything issued, collapsed" band would hide them.
5. `bloqueada` past or near its deadline, then the rest.
6. `enviando` older than `NOTA_SETTLE_DELAY`.
7. `pendente` by deadline proximity.
8. Everything issued, collapsed.

Each row carries the church, competência, value, deadline, urgency, **the age since the payment**, and the vendor's own message when there is one. Actions per row: **Emitir agora**, **Consultar no emissor**, **Tentar novamente** (only from `erro`), **Registrar nota emitida à mão**, **Dispensar** (only for an orphan), **Abrir PDF**, **Baixar XML**.

**Age since payment is shown beside the deadline, and it is there because the deadline can lie.** Under advance billing the competência is a *future* month, so `notaDeadline` lands ~35 days out and `notaUrgency` never escalates — on exactly the rows most at risk, the `bloqueada` backlog of a church that has not sent its CNPJ. A queue sorted only by deadline would show a three-month-old unissued nota as comfortable. The age column does not fix the convention (that is owner decision 4 and the accountant's answer); it makes the convention's blind spot visible while it is unresolved.

**Manual registration** takes `numero`, an optional `codigo_verificacao`, an optional PDF link and a date. It is **one conditional statement**, not a read followed by a write:

```sql
UPDATE nota_fiscal
   SET status = 'manual', provider = 'manual', numero = $2,
       codigo_verificacao = $3, url_pdf = $4, issued_at = $5
 WHERE id = $1 AND status IN ('pendente','bloqueada','erro')
RETURNING id
```

**Zero rows is a refusal with a verbatim pt-BR message, and the reason this is a statement rather than a check is a duplicate nota.** With no transactions, "read the status, see `pendente`, write `manual`" is two statements with the hourly cron running between them. The scenario is ordinary: Rafael opens `/owner/notas`, sees `pendente`, clicks **Registrar nota emitida à mão**; the cron fires in the gap, moves the row to `enviando` and sends it. The manual write lands `status = 'manual'`, the row leaves the settle pass's selection **forever** — nothing will ever call `consultar(ref)` on it — and the automatic nota arrives anyway. Two notas, created by the feature written to prevent one. The `WHERE` clause is what makes that impossible, and the test for it is two simultaneous calls, not a status check.

The refusal message covers every zero-row case honestly, including the row having already been issued or dispensed, because zero rows does not say which: `Não foi possível registrar: o estado desta nota mudou (o envio automático pode ter começado). Atualize a fila e consulte o emissor antes de tentar de novo.`

**Orphans: un-issued rows whose church was deleted, and the Dispensar action that ends them.** `nota_fiscal.church_id` nulls on deletion while `church_fiscal` cascades, so a `pendente`, `bloqueada` or `erro` row at deletion time survives with no church, no fiscal identity, no XML and no reachable terminal state. The issue pass can only move it to `bloqueada` (`dados_incompletos`) forever, the release-on-save statement is keyed on `church_id` and no save will ever come, and it sits in the queue showing an overdue deadline that nothing can clear — the exact "permanently red row" that teaches Rafael to stop reading the queue.

Cascading these rows away is the wrong fix: an `enviando` or `processando` row may correspond to a document that exists, and deleting it destroys the only record of one. Those two need no special handling anyway — the settle pass identifies rows by `provider_ref`, not by church, so an orphan settles normally into `emitida` (kept, correctly, as the legal record) or `erro` (which then becomes dispensable). So the fix is one action and one reason code: **Dispensar**, offered only on rows with `church_id IS NULL` and `status IN ('pendente','bloqueada','erro')`, writing `dispensada` with reason `igreja_removida` in the same conditional shape as every other write here.

**What Dispensar does not claim.** It records that no nota was issued and why. It does **not** decide whether one is still owed for a payment a departed church made — that is a fiscal question, it is on the accountant's list, and a `dispensada` row is exactly the visible artifact that lets the answer be applied later instead of the row disappearing.

**The heartbeat warning** sits at the top of the page and reads the `nota_run` row. Past three hours it warns. This is the detector for a dead scheduler, and it exists because an empty queue and a stopped cron are otherwise indistinguishable. **Beside it sits the descrição-do-serviço banner** when `DESCRICAO_APROVADA` is `false`: the issue pass is doing nothing, and a stalled queue that does not say so is worse than no queue.

The per-church page gains the **Dados fiscais** card and a short list of that church's recent notas.

## What the church sees

Deliberately close to nothing, and for once that is generous rather than defensive.

`/admin/configuracoes` gains a read-only **Dados fiscais** block: CNPJ, razão social, and the e-mail the nota is sent to, with a sentence saying corrections go through support and why. Below it, **Notas emitidas** — competência, number, value, and a PDF link, for issued, manual and cancelled documents only. It is served by `src/lib/repo/nota-church.ts`, which takes no church id.

The block adds **no new page**: it renders inside `src/app/admin/(protected)/configuracoes/page.tsx`, which already imports `requireReadableSession` on line 1 and calls it on line 9, so the `admin read guard` test passes unchanged and nothing joins `NO_CHURCH_DATA`. Stated here so the next reader knows it was checked rather than overlooked.

It uses `requireReadableSession`, not `requireWritableSession`: a suspended church reading its own past fiscal documents is exactly what reading is still for.

There is no relationship between this and the **Ofertas** menu item. Ofertas is what a member gives their church; a nota fiscal is a document the vendor owes the church. They never appear on the same screen and share no vocabulary.

## Failure modes

| Failure | What happens |
|---|---|
| **Church pays with no fiscal data** | Row claimed in `bloqueada` with the right competência and amount. Queue shows it with a deadline. Drains automatically when the data is saved. |
| **Fiscal data saved three months late** | Three rows release at once, three correct competências, three late notas. The queue shows each as overdue and names the accountant. Automation cannot reopen a closed competência and does not claim to. |
| **Vendor times out mid-send** | `indisponivel` → no write → row stays `enviando`. Settle pass calls `consultar(ref)`. Nothing is re-sent. |
| **Lambda killed between send and record** | Identical to the above by construction: the `enviando` transition committed before the call. |
| **Vendor rejects the payload** | `erro` with the vendor's code and message, verbatim, in `/owner`. Human fixes data, retries, new ref. |
| **Webhook delivered twice** | Billing's `stripe_event` primary key absorbs it. Even if it did not, `nota_fiscal_stripe_invoice_uq` absorbs it. |
| **Two cron runs overlap** | Every state-changing write is conditional on the state it expects — `ON CONFLICT DO NOTHING` in pass 1, `WHERE … status = 'pendente'` on the issue claim, and the same shape for the refund, manual and dispense writes. Exactly one lambda proceeds per row, per write. |
| **Our claim row lost (restore from backup), vendor already has the document** | The ref is `nf-{stripe_invoice_id}-{attempt}`, so the replayed claim reconstructs **the same ref from Stripe alone** — the row is not needed. The vendor refuses a second issuance under it, the adapter turns that refusal into a `consultar`, and the row lands on the document that already exists. This is the second idempotency layer earning its place; under the earlier client-side-uuid design it did not, because the ref died with the row. |
| **Rafael registers a nota by hand while the cron sends the same row** | The `WHERE … status IN ('pendente','bloqueada','erro')` on the manual write returns zero rows and refuses in pt-BR. Without it: one manual row plus one automatic nota, and a row the settle pass would never look at again. |
| **A refund is handled and the run repeats an hour later** | The watermark on the nota row was written in the same statement as the decision, so the event is not re-selected. The two deferring arms (`enviando`, `processando`) write no watermark and are re-selected on purpose. |
| **Invoice paid and refunded inside one hourly window** | Pass 1 claims `pendente`, **pass 2 dispenses it**, pass 3 never sees it. No document is created and no municipal cancellation window is entered. Under the earlier pass order this produced an issued-then-cancelled nota minutes apart. |
| **A refund arrives mid-run, after pass 2** | The nota is issued and cancelled on the next run — the `emitida` → `cancelar` path, which exists for this. The residual window is one pass, and the guarantee is worded as "never issue against a refund we can see". |
| **`DESCRICAO_APROVADA` still false at deploy** | The issue pass does nothing, `/owner` carries a banner, `nota_run.last_result` names it, and rows accrue visible deadline pressure in `pendente`. **No fiscal document is ever filed carrying a placeholder.** |
| **Church deleted with un-issued notas** | `enviando`/`processando` rows settle normally — the settle pass keys on `provider_ref`, not on church. `pendente`/`bloqueada`/`erro` rows become orphans that no automatic path can drain, and Rafael ends each with **Dispensar** (`igreja_removida`). Whether a nota is still owed is the accountant's question, and the `dispensada` row is what keeps it askable. |
| **Municipality rejects after the vendor accepted** | `processando` → `erro` via the settle pass, with the prefeitura's message. |
| **Full refund, nota issued** | Cancellation attempted. Confirmed → `cancelada`. Refused → `cancelamento_falhou`, top of the queue, escalated copy. |
| **Full refund, nota not yet issued** | `dispensada`, reason `estornada`. No document is ever created. |
| **Full refund while `enviando`** | Nothing until the row settles; cancelled on the following pass. |
| **Partial refund** | Recorded, flagged, no automated action. A substituting nota is an accountant's call. |
| **Dispute** | Recorded, no action. Deliberately unlike a refund. |
| **Cron never runs** | `nota_run.last_run_at` ages and `/owner` warns past three hours. This is the only detector, which is why the table exists. |
| **Cron runs, but the plan coarsens it to daily** | The heartbeat does **not** catch this — a daily run keeps `last_run_at` fresh enough often enough to look alive, and the three-hour warning would fire and clear in a pattern easy to dismiss. There is no code fix; it is a hosting-plan prerequisite, listed as one, and the number of retries before the deadline drops from ~120 to ~5. |
| **Vendor account suspended or vendor shuts down** | Every send returns `indisponivel`; rows accumulate in `enviando` and `pendente` and are visible. Rafael issues by hand in the Emissor Nacional and records each with **Registrar nota emitida à mão**. Already-issued XML is in our database, not at the vendor. This is not hypothetical — see Nuvem Fiscal. |
| **Zero-value invoice** | `dispensada`, reason `valor_zero`, visible as a row so the accountant's answer can change it later. |
| **Non-BRL invoice** | `bloqueada`. Never issue a nota for a number in the wrong unit. |
| **`invoice.paid` names a church billing has not matched** | No nota is claimed. Billing's repair queue binds it; the next hourly pass claims it with no replay machinery. |
| **Church deleted with issued notas** | `nota_fiscal.church_id` nulls; the rows and their XML survive, which is the point of the `SET NULL`. `church_fiscal` cascades away. Both asserted in the isolation suite. |
| **`FOCUS_NFE_TOKEN` unset** | The queue route refuses with a named pt-BR error and writes no state. Rows stay `pendente`. |
| **Two churches share one CNPJ** | Allowed today — `church_fiscal.church_id` is unique, `cnpj` is not. Two notas to the same taker for two subscriptions is correct if they are two subscriptions. |

## User-facing strings

Every string is Brazilian Portuguese and appears verbatim in the implementation. `{data}` is `dd/mm/aaaa`, `{mm/aaaa}` a competência, `{n}` an integer, `{valor}` a BRL amount with comma decimals.

### Owner console — Dados fiscais

- `Dados fiscais`
- `Estes dados aparecem na nota fiscal. Só você pode editá-los.`
- `CNPJ`
- `Razão social (exatamente como está no cartão CNPJ)`
- `Inscrição municipal (se houver)`
- `CEP`
- `Logradouro`
- `Número`
- `Complemento`
- `Bairro`
- `Município`
- `UF`
- `Código IBGE do município`
- `E-mail para envio da nota`
- `Nome do responsável financeiro`
- `Observações internas`
- `Salvar dados fiscais`
- `Marcar como conferido`
- `Última conferência: {data}`
- `Dados fiscais salvos.`
- `Dados fiscais salvos. {n} nota(s) liberada(s) para emissão.`
- `Informe um CNPJ com 14 dígitos.`
- `Informe a razão social exatamente como está no cartão CNPJ. O nome usado no painel não serve.`
- `Informe o código IBGE do município (7 dígitos).`
- `Informe um CEP com 8 dígitos.`
- `Informe a UF com 2 letras.`
- `Informe um e-mail válido para envio da nota.`
- `Este é o e-mail de login do painel. A nota precisa ir para quem cuida da contabilidade da igreja.`
- `Não foi possível salvar os dados fiscais. Tente novamente.`
- `⚠️ Esta igreja ainda não tem dados fiscais. Nenhuma nota pode ser emitida.`

### Owner console — church list badge

- `Sem dados fiscais`

### Owner console — fila de notas

- `Notas fiscais`
- `Nenhuma nota na fila.`
- Status labels: `Pendente` · `Bloqueada` · `Enviando` · `Processando` · `Emitida` · `Erro` · `Cancelada` · `Cancelamento falhou` · `Emitida à mão` · `Dispensada`
- `Competência {mm/aaaa} · {igreja} · R$ {valor}`
- `Prazo: até {data}.`
- `⚠️ O prazo vence em {n} dia(s).`
- `🚨 Prazo vencido em {data}. Fale com a contabilidade antes de emitir.`
- `🚨 O cancelamento desta nota foi recusado. O prazo na prefeitura provavelmente já passou — fale com a contabilidade.`
- `Motivo: dados fiscais da igreja incompletos.`
- `Motivo: a cobrança não está em reais.`
- `Dispensada: cobrança de valor zero.`
- `Dispensada: cobrança estornada antes da emissão.`
- `Recusada pelo emissor: {mensagem}`
- `Estorno parcial registrado. Uma nota substitutiva pode ser necessária — confirme com a contabilidade.`
- `Contestação registrada no Stripe. Nenhuma ação foi tomada nesta nota.`
- `Emitir agora`
- `Consultar no emissor`
- `Tentar novamente`
- `Ao tentar novamente, uma nova referência é gerada no emissor. Use isto só depois de corrigir os dados fiscais.`
- `Registrar nota emitida à mão`
- `Número da nota`
- `Não foi possível registrar: o estado desta nota mudou (o envio automático pode ter começado). Atualize a fila e consulte o emissor antes de tentar de novo.`
- `Igreja removida`
- `Dispensar`
- `Esta igreja foi removida. Nenhuma nota pode mais ser emitida para ela. Dispensar registra que o documento não foi emitido — confirme com a contabilidade se ele ainda é devido.`
- `Dispensada: igreja removida.`
- `Sinalizada`
- `Estorno registrado em uma nota emitida à mão. Verifique no emissor onde ela foi emitida.`
- `Pago há {n} dia(s).`
- `🚨 A emissão está parada: a descrição do serviço ainda não foi aprovada pela contabilidade. Nenhuma nota será emitida até que ela seja aprovada.`
- `Código de verificação (opcional)`
- `Link do PDF (opcional)`
- `Data de emissão`
- `Registrar`
- `Não é possível registrar uma nota à mão enquanto o envio automático está em andamento. Consulte o emissor primeiro.`
- `Abrir PDF`
- `Baixar XML`
- `Não foi possível falar com o emissor. A nota continua na fila e será tentada de novo.`
- `A emissão de notas não está configurada. Verifique o token do emissor.`
- `Fila verificada há {n} minuto(s).`
- `⚠️ A fila de notas não roda há {n} hora(s). Verifique o agendamento.`
- `Processar fila agora`
- `Fila processada: {n} nota(s) emitida(s), {n} pendente(s), {n} com erro.`

### Church panel — Configurações → Dados fiscais

- `Dados fiscais`
- `Estes são os dados que aparecem na nota fiscal da sua igreja.`
- `CNPJ: {cnpj}`
- `Razão social: {razao}`
- `Nota enviada para: {email}`
- `Para corrigir qualquer um destes dados, fale com o suporte. Eles não podem ser editados aqui porque são o que vai no documento fiscal.`
- `Ainda não recebemos os dados fiscais da sua igreja. Envie o cartão CNPJ ao suporte para que a nota possa ser emitida.`
- `Notas emitidas`
- `Nenhuma nota emitida ainda.`
- `{mm/aaaa} — nota {numero} — R$ {valor}`
- `{mm/aaaa} — nota {numero} — cancelada`
- `Abrir PDF`

### On the nota itself

The **descrição do serviço** is a constant in `src/lib/nota/servico.ts`, reviewed in a diff, never derived from church-editable content and never stored in a column a church can reach:

> `Licenciamento de uso de sistema automatizado de atendimento via WhatsApp — assinatura mensal, competência {mm/aaaa}.`

**The earlier draft shipped that sentence with `[TEXTO A CONFIRMAR COM A CONTABILIDADE]` appended, and argued the marker made forgetting "impossible to miss on the first nota". That argument is backwards and the marker is removed.** By the time anyone sees the first nota, the document is filed with the prefeitura, it is inside a cancellation window this same spec calls "days, not weeks", and the church's treasurer already has a copy. The marker does not prevent the mistake; it prints the mistake onto the artifact that is hardest to take back. It is also user-facing text that is not a sentence, in a subsystem whose whole output is a legal document.

The guard is a gate, not a label. `servico.ts` exports `DESCRICAO_APROVADA`, `false` until the accountant's wording is merged in a diff, and **the issue pass does no work while it is false** — checked before any row is selected, with the reason in `nota_run.last_result` and a banner at the top of `/owner/notas`. Rows accumulate in `pendente` with their deadlines visibly running.

**Why the gate sits before the pass rather than being a `bloqueada` reason.** A review suggested `bloqueada` with reason `descricao_nao_aprovada`, which closes the same hole. It costs more: `bloqueada` is only left through the release-on-save statement, keyed on saving a church's fiscal data, so approving a *global* constant would drain nothing and would need a second release path — a migration or a script written for one use. Gating before selection needs no new state, no new release, and drains by itself on the first pass after the constant flips. It is also the louder failure: the entire queue stalls with one named reason instead of individual rows quietly turning red for a cause that is not about them.

The cost is stated: while the gate is closed, **nothing is issued at all**, including for churches whose data is perfect. That is the correct trade — every nota carries this sentence, so an unapproved sentence means no nota is safe to issue — and it is why approving the wording is on the owner's list rather than the developer's.

## Environment, dependencies and vendor configuration

**No new package dependency of this subsystem's own.** The Focus adapter is `fetch`, and that is a design choice rather than an accident. **It does not mean the subsystem is package-free:** the claim and refund passes read Stripe through `src/lib/billing/stripe-client.ts`, so `stripe` and `STRIPE_SECRET_KEY` are dependencies of this subsystem, declared in the module table and covered by the credential rule — see the privilege section.

**A new script:** `"nota:processar": "tsx scripts/nota-processar.ts"`, alongside the existing `create-church` and friends.

New variables in `.env.example`:

| Variable | Purpose |
|---|---|
| `FOCUS_NFE_TOKEN` | The vendor API token. Platform-wide vendor credential, like the Stripe key and unlike the per-church Meta credentials. |
| `FOCUS_NFE_BASE_URL` | Production or homologação. **Named explicitly** so a test run cannot silently issue a real fiscal document. |
| `NOTA_CNPJ_PRESTADOR` | Rafael's CNPJ. |
| `NOTA_INSCRICAO_MUNICIPAL` | His inscrição municipal. |
| `NOTA_CODIGO_MUNICIPIO` | The IBGE code of **his** municipality. ⚠️ **Provisional.** This assumes ISS is due at the prestador's establishment (LC 116 art. 3 *caput*). That reading is unconfirmed and is the single question on the unverifiable list that could invalidate the architecture rather than a field — if ISS turns out to be due at the destination, this variable stops being a constant and the provider choice changes. Do not read this row as settled. |
| `NOTA_ITEM_LISTA_SERVICO` | The LC 116 item. **Accountant-supplied.** |
| `NOTA_CODIGO_TRIBUTACAO_NACIONAL` | Accountant-supplied. |
| `NOTA_CODIGO_NBS` | Accountant-supplied. |
| `NOTA_ALIQUOTA_ISS` | Accountant-supplied. |
| `NOTA_REGIME_TRIBUTARIO` | Simples Nacional indicators / regime especial. Accountant-supplied. |

**Every issuer-side value is environment configuration, not a database row**, and not a church column. It is vendor data, it changes when Rafael's accountant says so, and it must be reviewable in a deploy rather than editable in a form.

`.env.example` line 1 still claims `DATABASE_URL` is "the ONLY secret this app needs" while `SESSION_SECRET` sits on line 7 and `BLOB_READ_WRITE_TOKEN` on line 10. That claim is already false today; the billing spec corrects it and this spec does not re-litigate it, only notes that it must not be reintroduced.

**Vendor and legal configuration that is part of "done", not optional afterwards:**

1. Rafael's CNPJ active with a services CNAE, **inscrição municipal** in his own city, and an **e-CNPJ A1 certificate** (A3 is for a human at a browser; an API integration needs A1).
2. Certificate uploaded to Focus NFe; the company registered there.
3. **Confirmation that his municipality is covered by Focus NFe**, or the R$ 199 / ~15-day integration ordered. Calendar time on the critical path.
4. A **homologação** issuance completed end-to-end before any production token exists, verifying in particular: whether the IBS/CBS fields are required on NFS-e today; whether `consultar` returns not-found for a ref submitted seconds ago; what `emitir` returns for a ref that already has a document; and whether a rejected ref can be reused. Those four are the experiments the state machine's safety rests on.
5. `vercel.json` gains the hourly cron entry beside billing's daily one — **and the Vercel plan must be one that honours a sub-daily schedule.** Confirm the current limits before relying on the cadence; a plan that coarsens cron to roughly daily silently removes the retry budget the whole deadline argument is built on, and the heartbeat will not report it.
6. The **descrição do serviço approved by the accountant** and merged, flipping `DESCRICAO_APROVADA`. Until then the issue pass is stalled by design and no nota is issued for anyone.

## Testing

Everything runs on PGlite and pure functions. **Nothing ever touches the live vendor**, and the base URL is an env var precisely so that is enforceable.

- **`prazo.ts`, pure** — `competenciaFrom` across the São Paulo/UTC boundary in both directions (02:00 UTC on 1 Feb is January; 23:30 UTC on 31 Jan is January); `notaDeadline` for a 31-day month, a 28-day February and a December→January rollover; `notaUrgency` inside, on and past the boundary, matching the `church-status.test.ts` style.
- **The claim statement, against PGlite** — this is the highest-value suite, because it is where the duplicate-prevention argument lives:
  - claiming the same `stripe_event` twice produces exactly one row;
  - two concurrent claims of the same invoice produce exactly one row;
  - a zero-value invoice lands `dispensada` and a non-BRL invoice lands `bloqueada`, each with its reason;
  - an `invoice.paid` row with `church_id IS NULL` claims nothing, and claims correctly on a later run **after** the event row is bound — the property that justifies consuming the ledger rather than the wire.
- **The `pendente → enviando` claim** — two simultaneous calls, exactly one returns a row; a call against a row already `enviando` returns none.
- **The state machine, with a stubbed provider** — one test per arm of `NotaOutcome`, and specifically: **`indisponivel` writes nothing at all**, asserted column by column, and **no input whatsoever moves a row from `enviando` to `pendente` except `desconhecida`**. That second test is the guard on the sentence this design is built around; it should be written to fail loudly if anyone adds an age-based timeout.
- **The derived ref** — `provider_ref` is `nf-{stripe_invoice_id}-1` and contains no uuid; **claiming the same invoice after the `nota_fiscal` row has been deleted produces the identical `provider_ref`**, which is the whole restore-from-backup argument reduced to one assertion; and the adapter maps a duplicate-ref refusal to the result of `consultar`, never to `rejeitada` — asserted on the stub, because that mapping is what stops a retry minting a second document.
- **Retry from `erro`** — increments `attempt`, mints `nf-{stripe_invoice_id}-2`, returns to `pendente`, in one statement; and a retry from `emitida` or `enviando` is refused.
- **Release on save** — three `bloqueada` rows for one church, all released by one save, count returned by `RETURNING` matches the message; rows belonging to another church are untouched.
- **Refund handling** — issued nota cancelled; refused cancellation lands `cancelamento_falhou`; a refund against a `pendente` nota lands `dispensada` and **never calls `emitir`**, asserted on the stub; a refund against `enviando` calls nothing and leaves the row alone; a partial refund calls nothing and leaves the row `emitida`; a refund against `cancelamento_falhou` calls **nothing at the vendor**, asserted on the stub.
- **Pass order** — an invoice whose `invoice.paid` and `charge.refunded` events are both present at the start of one run ends `dispensada` with **zero calls to `emitir`**. This is the test that would have failed under the previous claim → issue → settle order, and it is the one that proves the reorder rather than describing it.
- **The refund watermark** — running the refund pass twice over the same event produces one state change and one flag; a `manual` row is flagged once and **not** re-flagged on the second run; a second, later refund event on the same nota **is** selected and acted on; two refund events sharing a `received_at` are both processed, which is the assertion that guards the `id` tie-break — without it the second is silently lost, and a lost refund reports nothing at all.
- **Manual registration** — allowed from `pendente`/`bloqueada`/`erro`, refused from `enviando`/`processando`/`emitida`/`manual`, and the refusal message is the verbatim pt-BR string. **Plus the concurrency shape:** two simultaneous calls against one `pendente` row — exactly one returns a row; and a manual write racing the `pendente → enviando` claim — exactly one of the two lands, never both. A behavioural-only test passes against read-check-then-write code and proves nothing about the duplicate this guard exists to stop.
- **Refund → `dispensada`, concurrency** — two simultaneous refund passes over one `pendente` row produce one `dispensada` and one no-op; a refund racing the issue pass's `pendente → enviando` claim leaves exactly one winner, and when the claim wins the watermark is **not** written, so the next pass re-evaluates.
- **The descrição gate** — with `DESCRICAO_APROVADA` false, the issue pass selects nothing and calls `emitir` zero times, `nota_run.last_result` names the reason, and every row stays `pendente`; flipping the constant drains them on the next pass with no release statement and no migration.
- **Orphans** — deleting a church leaves a `pendente` row with a null `church_id` that the issue pass cannot drain; **Dispensar** ends it as `dispensada`/`igreja_removida` and is refused for a row whose `church_id` is not null; an `enviando` orphan still settles through `consultar(ref)`, proving the settle pass keys on the ref and not on the church.
- **Queue ordering and progress** — seed more rows than the cap; assert the oldest-attempt page is processed and every one advanced; run again and assert the second page moves and the first is not revisited; make one row's provider call throw every time and assert it neither blocks its page nor sits at the head of the next run. Billing's suite, applied to this cursor.
- **Heartbeat** — a run with zero eligible rows still writes `nota_run`, which is the whole point of it.
- **Church isolation** — `nota-church.ts` with the session stubbed to church A (the `tests/session-guards.test.ts:36-43` pattern) returns only A's issued rows, returns no `erro`/`bloqueada`/`pendente` row at all, and exposes no `provider_ref` or `erro_mensagem`; a suspended church still gets its list.
- **Tenant isolation, two added assertions** — deleting a church leaves its `nota_fiscal` rows present with a null `church_id` and their `xml` intact, **and** removes its `church_fiscal` row. The exception and the non-exception are each tested.
- **Privilege boundary** — the four new keys, plus injected violations watched failing first: an import of `src/lib/nota/focus.ts` from `src/app/api/whatsapp/webhook/route.ts`, and a literal `process.env.FOCUS_NFE_TOKEN` in `src/lib/repo/nota-church.ts`.
- **`admin read guard`** — no change needed and none made; the block renders inside a page that already calls `requireReadableSession` (`src/app/admin/(protected)/configuracoes/page.tsx:1,9`).

## Out of scope

- **Any nota to anyone but the church.** Members receive nothing fiscal; nothing about ofertas is touched.
- **Multi-municipality issuance.** The entire design assumes ISS is due at Rafael's own establishment (LC 116 art. 3 *caput*). If that reading fails for this service, this is a re-spec, not a configuration change — and that is the loudest item on the list below.
- **NF-e, NFC-e, CT-e, MDF-e.** Products and transport. Not this business.
- **Nota substitutiva / correction of an issued nota.** A partial refund is flagged for a human; automating a substitution needs the municipal window and the service-code implications settled first.
- **Retenção de ISS by the taker.** No evidence it applies; no field carried.
- **A second invoicing provider running in parallel.** The interface makes replacement cheap; running two at once doubles the duplicate risk for no benefit.
- **Automatic delivery of the PDF to the church by e-mail from us.** The vendor sends it to `email_fiscal`; we have no mail infrastructure, and the billing spec's reasoning against sending messages on a user's behalf applies unchanged.
- **PGDAS-D, DAS payment, contabilidade.** Rafael's accountant's job, not the product's.

## What cannot be verified here

The honest list. Everything below is a claim to be checked against a real account, a real municipality or a real accountant — never resolved by asserting it in this document.

**Legal and fiscal — an accountant answers these, in writing, before code:**

- **Whether ISS is genuinely due only in Rafael's municipality for *this* product.** The whole design rests on LC 116 art. 3 *caput* and on the service being item **1.05** (licenciamento de software). The classification is contestable — 1.03 (processamento de dados), 1.09 (disponibilização de conteúdo, added by LC 157/2016) — and a WhatsApp bot with per-church editable content is arguably not pure licenciamento. **If the answer turns out to be destination-based, the multi-municipality problem returns and the provider choice changes.** This is the single most valuable question to pay to have answered.
- Which LC 116 item, which CNAE, which `codigo_tributacao_nacional_iss` and which `codigo_nbs`. Not guessed here; they are env vars with no defaults for that reason.
- Whether a Simples Nacional ME must still populate ISS value fields on the nota, and how.
- Whether any municipality would designate an immune religious entity as ISS *substituto tributário*. If it can, both the fields and the amount Rafael receives change.
- **The exact correction and cancellation window in Rafael's municipality.** This number, and only this number, sets how urgent the `cancelamento_falhou` alert has to be.
- **The real issuance deadline in Rafael's municipality**, which the deadline rule currently guesses. The rule shipped as "the safe envelope over every municipal variant found" and that description was false: permitting the 5th of the *following* month is the **loosest** variant found, and in a *no ato da prestação* municipality it is up to ~35 days late. It is now labelled a provisional placeholder in a named constant, and this is the answer that replaces it.
- **Whether the working reading of church immunity is right** — that CF art. 150, VI, "b" leaves Rafael's ISS as *prestador* untouched. Stated as provisional in the Overview rather than as fact, because it is the same question as the substituto-tributário item below.
- What a nota for a **closed** competência costs — refusal, penalty, or nothing. This is what the backlog-release path is actually exposed to.
- Whether a nota is owed at all for a zero-value invoice.
- **Whether the congregation using the bot is the same legal entity as the CNPJ on the nota.** Congregações and filiais under a convenção's CNPJ are common. `church_fiscal.church_id` is unique today on the explicit assumption that this is 1:1, and the escape route is written into the schema section.
- Whether Rafael already has a CNPJ, an **inscrição municipal** and an **e-CNPJ A1**. Nothing in this repository indicates it, the inscrição can require an alvará first, and all three are ahead of any code on the critical path.

**Rollout and vendor — one call or one e-mail each:**

- **The status of the NFS-e Padrão Nacional as of August 2026.** Sources conflict irreconcilably: LC 214/2025 plus CNM messaging ties municipal adhesion to federal transfers from January 2026, while the official gov.br FAQ describes national adoption as optional provided the municipality mirrors data to the ADN. Both framings may be true at once. **Rafael's operative question is narrower and answerable: is his own city on the national standard today, or on its own system?**
- **Whether IBS/CBS fields are mandatory on NFS-e right now.** NT 007 formalised the group and was operative from 09/02/2026 in both environments, while stating that full use of the fields "depende do avanço do cronograma"; at least one vendor's marketing claims mandatory destaque from 01/01/2026. **Verify against a live homologação issuance, not against an article.**
- Whether Rafael's municipality is integrated by Focus NFe today, and the real cost and lead time if not.
- **The exact Focus NFe field names for NFS-e Nacional.** The reference page could not be retrieved while writing this; `payload.ts` is written against a schema nobody here has read, and it is deliberately the thinnest module in the subsystem for that reason.
- **That a `ref` at Focus NFe means "one ref, one document, forever"**, and that a *rejected* ref cannot be reused. The two-layer idempotency argument and the attempt-increment design both rest on this. One homologação experiment answers it.
- **Whether `consultar` returns not-found for a ref submitted seconds ago.** This is the question the design actually rests on and the earlier draft never asked. If Focus reports an in-flight ref as not-found, `desconhecida` is not proof that nothing was created, and the `enviando → pendente` edge — the only edge out of the crash state — is unsound on its own. The derived ref absorbs a wrong answer (the re-send carries the same ref and the vendor deduplicates it), but that absorption is itself unverified, so **this and the ref question must be answered together, in the same homologação session, before the settle pass is trusted.**
- **What `emitir` returns for a ref that already has a document, and whether it is distinguishable from a rejection.** The adapter is required to map it to a `consultar`; if Focus does not distinguish the two, that requirement cannot be implemented as written and the retry-from-`erro` path needs rethinking before launch, not after.
- **The maximum length and permitted character set of a Focus `ref`.** `nf-` plus a Stripe `in_…` is roughly 32 characters of `[A-Za-z0-9_-]`. If that is refused, the fallback is `nf-{first 16 hex of sha256(stripe_invoice_id)}-{attempt}`, which is still reconstructible from Stripe alone. Truncating the invoice id is not an acceptable fallback.
- All quoted prices. Focus NFe's were read from `focusnfe.com.br/precos` on 2026-08-07 and Spedy's from its own pages the same day; both may be stale by the time anyone acts on them.

**Stripe — one live call each, and note these compound with billing's own unverified list:**

- Whether **`invoice.paid`** is the right event, or `invoice.payment_succeeded`, and whether it fires for a trial conversion and for a zero-value invoice.
- Whether the invoice's service period lives on the invoice or on the line item — the same uncertainty billing already records about `current_period_end`, and here it decides the **competência**, which is not cosmetic.
- Whether `amount_paid` is the right field against a partially-credited invoice.

**Infrastructure:** nothing in this repository has executed against Neon, Vercel Cron has never run, and `NOTA_BATCH` and `NOTA_SETTLE_DELAY` against `maxDuration` need a measured Focus NFe round-trip from a deployed function. The numbers here — batch size, and 5 minutes for the settle delay — are a starting point to be measured, not a result.

- **Whether the hosting plan actually delivers an hourly cron.** The repo has no `vercel.json` (verified), and Vercel's lower tiers are understood to coarsen cron triggers to roughly once a day. **This spec has not verified the current limits and does not assert them** — but the hourly cadence, and the ~120-retries-before-the-deadline argument that justifies it, are void on a plan that does not honour a sub-daily schedule. Confirm at signup; it is listed as a launch prerequisite, and the heartbeat will not detect the degraded case.
- **Whether a nota is still owed for a payment made by a church that has since been deleted.** Orphan rows are ended by hand as `dispensada`/`igreja_removida`, which records the non-issuance without deciding the fiscal question. If the answer is that one *is* owed, those rows are the list to work from.

## What the owner must decide

1. **Confirm Focus NFe**, and run the municipality-coverage check before anything is built.
2. **Book the accountant** for the fiscal list above, and specifically for the LC 116 item — the one answer that could invalidate the architecture rather than a field.
3. **Approve the descrição do serviço** sentence. **Nothing is issued until this happens** — the issue pass is gated on it, deliberately, because the alternative is filing a document with a placeholder on it. This is on the critical path in the same way the inscrição municipal is.
4. **The competência convention** for a subscription billed in advance: this spec defaults to the month of the line item's `period_start` and that default needs the accountant's blessing, not a developer's.

   **One consequence is worth naming beside the decision, because it makes a queue look calm when it is not.** Under advance billing, `period_start` puts the competência in a *future* month, so `notaDeadline` lands ~35 days out and `notaUrgency` never escalates — on precisely the rows most at risk, the `bloqueada` backlog of a church that has not yet sent its CNPJ. The queue therefore shows **age since payment** next to the deadline, so the blind spot is visible while the convention is unresolved. If the accountant says the competência is the payment month instead, `competenciaFrom`, `notaDeadline` and the whole urgency ladder change together — it is one pure module and its tests, but it is not a display tweak.

5. **The issuance deadline** the placeholder rule stands in for. The "5th of the following month" rule is not the safe envelope the earlier draft called it; it is the loosest variant found, and it is a named constant waiting to be replaced.
6. **How long the stored `xml` is retained.** This spec keeps it indefinitely, which is a deliberate over-retention of a document Rafael is required to hold — but "indefinitely" is not a retention policy, and the LGPD spec's discipline says so.
7. **Whether a zero-value invoice owes a nota**, which decides whether `dispensada` stays a state or becomes a bug.
8. **The Vercel plan.** Hourly cron is a paid capability, and the retry budget behind every deadline argument in this document depends on getting it. If the answer is no, the cadence is daily and the **Processar fila agora** button becomes part of Rafael's routine rather than a diagnostic.

## Prerequisite and sequencing

This subsystem **cannot be built before the Stripe billing subsystem**, because its trigger is billing's `stripe_event` ledger and its migration must be numbered after billing's.

But it **must be built before the first church with a CNPJ is asked to pay**, because that church's treasurer will ask for the document before the first charge, not after it. The ordering is therefore tight and not negotiable: billing, then nota, then the first invoice — and the accountant and the inscrição municipal start before either, because they are the only items here measured in weeks.

## Revisions

### Revision 1 — adversarial review, 2026-08-07

The review verified every code citation in the original draft against source, and this revision re-verified them independently before changing anything: `src/db/schema.ts:11-49` carries no fiscal field; `src/lib/repo/church-admin.ts:17-29` is the 11-name allowlist; `tests/privilege-boundary.test.ts:45` skips `ALLOWED` in `walk()` and `:57` returns `null` for bare specifiers; `src/lib/auth/writable.ts:75-84` is `requireReadableSession`; `src/lib/provisioning.ts:33-37` takes three arguments; `src/app/admin/(protected)/configuracoes/page.tsx` imports the read guard on line 1 and calls it on line 9. Two facts the review asserted were also checked here rather than taken on trust: **the repo has no `vercel.json`** (it does not) and **`src/lib/billing/` does not exist yet** (it does not — it is billing's to create, which is why this spec can only declare a dependency on `stripe-client.ts`, not cite it).

**Ten required findings, all closed. Nothing was refuted outright; one was closed by a different mechanism than the one proposed, and that substitution is argued in place.**

| # | Finding | What changed, and why |
|---|---|---|
| 1 | The second idempotency layer was derived from the first | `provider_ref` is now `nf-{stripe_invoice_id}-{attempt}`, not `nf-{uuid}-1`. The review's diagnosis was exactly right and self-refuting was the correct word: a client-side uuid lives only on the row, so "the ref is derivable from the row" is not a second layer when the row is what was lost. Closing it properly needed one thing the review did not name: **an adapter rule that a duplicate-ref refusal is resolved by `consultar`, never mapped to `rejeitada`.** Without it the derived ref makes things worse — the refusal lands in `erro`, Rafael retries, `attempt` increments, and a *new* ref issues the second document. Two new items on the unverifiable list (what `emitir` returns for an existing ref; the ref's length and character set, with a sha256 fallback that keeps reconstructibility). |
| 2 | Manual registration and refund→`dispensada` were read-check-then-write | Both are now single conditional statements with `RETURNING`, and the discipline is stated once as a table in "No transactions" so the next write cannot quietly opt out. Manual registration gained a new verbatim pt-BR refusal that is true in **every** zero-row case, not only the race with the queue — the old string named the cron specifically and would have lied about an already-issued row. Tests are the two-simultaneous-calls shape; the spec now says plainly why the behavioural test proves nothing. |
| 3 | The `enviando` age gate contradicted the invariant it was meant to serve | Named: `NOTA_SETTLE_DELAY`, 5 minutes to start, a measured number on the infrastructure list. Reconciled explicitly — **the threshold governs when we ask, never what we conclude**, nothing about age is written to a row. The question the design actually rests on ("does `consultar` return not-found for an in-flight ref?") is now the *first* homologação experiment. The derived ref turns out to make a wrong `desconhecida` cost one call rather than a document, since the re-send carries the same ref; that is stated as a reason the threshold can be a starting number, **not** as a reason to skip the experiment. |
| 4 | Refunds were swept after issuance | Pass order is now claim → **refund** → issue → settle; the spec has four passes. The stated guarantee was reworded to what the design can actually deliver — "never issue against a refund we can see" — and the residual one-pass window is named rather than glossed, with the `emitida` → `cancelar` path identified as its backstop. |
| 5 | No refund cursor, and `cancelamento_falhou` missing from the action table | Two columns on `nota_fiscal` (`estorno_tratado_ate`, `estorno_evento_id`) compared as a row value. A boolean was rejected because a partial refund followed by a full one needs two decisions; a bare timestamp was rejected because two events sharing a `received_at` would leave the second **permanently unprocessed** — a missed refund that reports nothing, which is the failure mode this project keeps having to unlearn. The `cancelamento_falhou` arm was added as an explicit **no-vendor-call** arm, resolving an ambiguity that could have been read as hourly re-attempts. |
| 6 | The deadline rule inverted its own evidence; two other claims asserted as fact | The rule is relabelled a **provisional placeholder** and the false "safe envelope" claim is retracted in place, with the ~35-days-late case in a *no ato* municipality stated. The immunity/ISS sentence in the Overview is now explicitly provisional and tied to the substituto-tributário question. `NOTA_CODIGO_MUNICIPIO` carries the LC 116 art. 3 *caput* caveat **inside the environment table**, because the review is right that Rafael reads the table and not the caveat 500 lines later. |
| 7 | `[TEXTO A CONFIRMAR]` shipped onto a real fiscal document | Marker deleted. Replaced by `DESCRICAO_APROVADA` in `servico.ts`, checked **before the issue pass selects anything**, with a banner and a `nota_run.last_result` reason. *This is the one place the fix differs from the review's proposal, deliberately:* a `bloqueada` reason code would need a second release path, because `bloqueada` is only left through the release-on-save statement, which is keyed on a church saving fiscal data and would drain nothing when a global constant flips. Gating before selection adds no state, no release, and no migration, and drains by itself. The cost — while the gate is closed, nothing issues for anyone — is stated rather than hidden. |
| 8 | The bare-package gap was claimed closed while open for the credential actually used | `src/lib/billing/stripe-client.ts` is in the module table. "No new package dependency" is qualified to "none of its own". The credential rule now covers `STRIPE_SECRET_KEY` **in this change**, and the claim that it is "strictly stronger" than billing's rule is retracted: the two rules sit side by side and catch different halves. One concrete consequence surfaced while writing it — `src/lib/nota/**` must join the owner *zone*, not just the owner-only set, or billing's own rule refuses the import this subsystem is built on. |
| 9 | Hourly cron may be unbuildable on the current plan | Stated as a launch prerequisite and an owner decision. **Deliberately not asserted as verified:** the exact tier limits are a vendor fact this session could not check, so the spec says the cadence *requires* a plan that honours a sub-daily schedule and that the limits must be confirmed at signup. The degraded mode is written out. A failure-mode row records that the heartbeat does **not** detect this — a daily run looks alive. |
| 10 | Deleted churches stranded un-issued rows | An **Órfãs** band in the queue and a **Dispensar** action writing `dispensada`/`igreja_removida`, in the same conditional shape as every other write. Cascading was rejected: an `enviando` row may name a document that exists. The settle pass keys on `provider_ref`, so `enviando`/`processando` orphans still resolve on their own — that is asserted in a test rather than assumed. Dispensar records the non-issuance and explicitly does **not** decide whether a nota is still owed, which is now on the accountant's list. |

**All three minor findings closed.** The state-machine prose no longer says saving `church_fiscal` releases "every" blocked row — it names the `dados_incompletos` filter and says why `moeda_invalida` and `igreja_removida` are correctly left blocked. The advance-billing competência blind spot is named beside owner decision 4, and the queue gained an **age since payment** column so a three-month-old blocked row cannot look comfortable while the convention is unresolved. The `stripe_event (type, processed_at)` index is added in this subsystem's migration, with its cross-spec ownership stated.

**Two things this revision was careful not to do.** It introduced no new tables, no new states and no new provider verbs — the ten findings closed with one column pair, one constant, one action, one adapter rule and a pass reorder. And it checked each fix against the failure pattern the previous specs on this project produced: a fix that shrinks a defect while making it invisible. Three were caught and fixed in the writing — the refund watermark's tie-break (a bare timestamp silently drops a refund), the partial-refund flag (a flagged `emitida` row would have been collapsed into "everything issued", so the queue gained a **Sinalizada** band), and the coarsened-cron case (the heartbeat cannot see it, so it is a prerequisite rather than a detector).
