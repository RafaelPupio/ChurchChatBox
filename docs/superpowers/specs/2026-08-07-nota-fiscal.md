# Secretária Virtual — Nota Fiscal (NFS-e)

**Design doc** · 2026-08-07 · Status: proposed · **Revision 3** (the sent-but-unconfirmed guard propagated to the three places Revision 2 left without it — see "Revisions")

## Overview

The Stripe spec makes a church's money correct. This one makes Rafael's paperwork correct, and it is deliberately a *different* subsystem because the two fail apart from each other: **a payment can succeed while the nota fails, and then the church owes nothing and Rafael owes a document.** Nothing in this design is allowed to make a nota failure look like a billing failure, and nothing is allowed to make a billing success imply a nota exists.

**This blocks revenue, not just compliance.** A church with a CNPJ has bookkeeping. Its treasurer generally cannot lawfully record a recurring payment without a fiscal document, and many will simply refuse to pay a subscription that produces none. So the sequence is not "sell, then sort out the nota" — it is **no nota, no sale**, with perfect billing code sitting idle behind it. The owner already recorded this as a launch dependency (`.superpowers/sdd/owner-decisions-2026-08-07.md:31-33`) and it is the reason this document exists at all rather than being a bullet in the billing spec's out-of-scope list.

Note what immunity does *not* buy anyone here. A church is immune under CF art. 150, VI, "b" — that protects the church from taxes on its own patrimony, income and services. It does not remove the church's need for the document.

**Provisional, and flagged as such rather than asserted:** the working reading is that this immunity does not touch the ISS **Rafael** owes as *prestador*, so immunity makes the church's side simpler and Rafael's side unchanged. That reading is not confirmed. It is exactly what the substituto-tributário question on the unverifiable list would overturn — if a municipality may designate an immune religious entity an ISS retention agent, the taker's condition changes both the fields on the document and the amount Rafael receives. Nothing in this spec is allowed to state the working reading as settled, here or in the environment table.

### What "done" means

1. Every successful subscription payment produces exactly one nota fiscal, or a visible, actionable row explaining why it has not yet.
2. **Never two notas for one payment.** A duplicate row is a UI annoyance; a duplicate nota is a tax problem with a cancellation window measured in days. **This is the goal, and one edge is not yet closed against it:** a restore from backup of a row that had reached `attempt > 1` depends on a vendor property nobody here has verified. It is stated as open in three places rather than assumed away, and it is one of the homologação experiments.
3. A nota that fails is retried automatically inside the fiscal deadline, and when automation cannot recover, Rafael can issue it by hand and record it here without the queue lying about it afterwards.
4. A church that pays before supplying its CNPJ — **the normal case, not the edge case** — accumulates claimed, blocked notas that all drain the moment its fiscal data is saved, each with its own correct competência.
5. A refunded payment never produces a nota if the refund was visible when the run started, and when a nota already exists the cancellation attempt is prompt and a refusal shouts rather than failing silently. **One stated exception, and it is a choice rather than a gap:** a row that was already sent and whose outcome the vendor has not confirmed is issued once more against the same ref — because the alternative is writing a terminal row that says no document exists while one may. It is then cancelled on the following pass, loudly, which is a better day than a permanent lie in the ledger.
6. Nothing in this subsystem can write a single column of `church`. Not `status`, not `grace_until`, not the Stripe mirrors.
7. The invoicing vendor is replaceable behind one interface with three verbs, and the reason that matters is on the record below.

### What already exists (verified, not assumed)

| Thing | Where | State |
|---|---|---|
| `church` row, 21 columns | `src/db/schema.ts:11-49` | **No fiscal field of any kind.** No CNPJ, no razão social, no address, no municipality. |
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
| Deadline rule | **Provisional placeholder**, not a finding: issue inside the competência month, and never later than the 5th of the following month. A named constant in `prazo.ts`, changed in a diff | **The earlier draft called this "the safe envelope over every municipal variant found" and that was wrong, in the direction that hurts.** The variants found — and every one of them is a **secondary-source reading on the unverifiable list, not a checked citation** — are SP (RPS→NFS-e in 10 days, and by the 5th when the taker collects), RJ (by the 5th, said to be Decreto 46.799/2019) and *no ato da prestação* in many cities. Two cautions travel with them: the decree number was not read at source, and an **RPS→NFS-e conversion deadline is not an issuance deadline for a direct NFS-e**, so the SP figure is weaker evidence for this rule than its precision suggests. A rule permitting the 5th of the **following** month is the loosest of those, not an envelope over them: in a *no ato* municipality it is up to ~35 days late. The real window is on the unverifiable list, so this ships as a placeholder Rafael's accountant replaces, and the queue is built to shout early rather than to trust the number. |
| Manual issuance | A first-class recorded state, not a workaround | There is a free, no-integration emissor to fall back to — **the Emissor Nacional (gov.br) if Rafael's municipality is on the NFS-e Padrão Nacional, and the prefeitura's own emissor if it is not. Which of the two it is has not been verified and is on the unverifiable list**; the state does not depend on the answer, but Rafael's disaster recovery does. A subsystem that cannot say "Rafael did this one by hand" leaves a permanently red row for a document that exists, which trains him to ignore the queue. |
| Privilege | Everything issuing-related is **owner-only**; one narrow church-facing read module | Copied wholesale from the billing spec's `stripe-client.ts` / `stripe-portal.ts` split, including the revision-3 tightening that deletes the tenant argument. |
| Writes to `church` | **Zero.** Not one column | The plainest possible statement of independent failure, and it is enforceable by reading the repo module. |

## The provider

**The call is Focus NFe.** One provider, not a menu.

### Why

- **Verified pricing, at Rafael's actual size.** Read from `focusnfe.com.br/precos` on 2026-08-07: **Solo, R$ 89,90/mês, 1 CNPJ, pacote com 100 notas, R$ 0,10 por nota adicional, 30 dias de testes**, NFS-e included. Start is R$ 113,90 for 3 CNPJs; Growth R$ 548,00. Rafael will issue tens of notas a month. Solo is the plan and it is the cheapest credible option that still has an API.
- **It is an API, not something else with an API.** Omie is an ERP: adopting it means a customer registry, a service registry and a fiscal configuration that all have to be kept in sync with the `church` table — a second source of truth, which is exactly what the billing spec's "money lives in Stripe" reasoning argues against. Spedy's cheap tiers have no API at all.
- **It documents `nfse-nacional` as a surface distinct from the per-municipality NFS-e API** (verified at `doc.focusnfe.com.br` on 2026-08-07, which lists both). That distinction matters precisely because the single open question about Rafael's city is *which of the two it is on*, and a provider that models both can absorb the answer either way.
- **It publishes technical analysis of NT 007** — the note that formalised the IBS/CBS group on the NFS-e Nacional layout. A vendor page gives its operative date as `09/02/2026` in both environments; **that date is read off a vendor page, was not confirmed at source, and `dd/mm` versus `mm/dd` leaves even the month ambiguous, so it is on the unverifiable list rather than stated here as a fact.** What the bullet actually rests on is weaker and still sufficient: a vendor writing about the layout change in public is a better signal than a vendor asserting readiness on a landing page.
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
- **A free manual emissor, direct:** free, manual, zero vendor risk. It is not the integration; **it is the fallback the system degrades to**, which is why `manual` is a real state in this design rather than an apology. **Its identity is conditional and unverified:** the Emissor Nacional (gov.br) serves municipalities that adhered to the NFS-e Padrão Nacional, and if Rafael's city runs its own system the fallback is that prefeitura's emissor instead. The design is indifferent between the two — `manual` records a number, not a provider — but **Rafael is not**, because this is the destination of every disaster path in this document, and a disaster is the wrong time to find out which one it is. Confirming it is a launch prerequisite, not a footnote.

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

export type CancelOutcome =
  | { kind: 'cancelada'; cancelledAt: Date }
  | { kind: 'recusada'; codigo: string; mensagem: string }  // a refusal we READ
  | { kind: 'desconhecida' }                      // the vendor says it holds no such ref
  | { kind: 'indisponivel' };                     // we never got an answer
```

**`CancelOutcome` was declared and never defined in the earlier draft, and the omission had a consequence rather than being untidy.** With two outcomes in the prose ("Confirmed → `cancelada`. Refused → `cancelamento_falhou`") an implementer under TS strict must put a `cancelar` timeout somewhere, and the only arm available is *refused* — which is terminal, writes the refund watermark, and tells Rafael in pt-BR that the prefeitura refused and the prazo has probably passed, about a cancellation that may have succeeded or may still be winnable inside a window this document itself calls days. The three arms are therefore the same discipline as `NotaOutcome`, applied to the shorter clock: **a refusal we read is not a refusal we failed to hear.**

**The fourth arm is this revision's, and it is the same category error one level down.** With three arms, a `cancelar` that reads a definite *no such ref* has nowhere to go but `recusada` — which is terminal `cancelamento_falhou` and prints in pt-BR that the prefeitura refused a document the vendor has just said it never held. `cancelar` runs only from `emitida`, so a not-found contradicts a `numero` and an `xml` already on our row: it is a vendor inconsistency, not a refusal, and it is not something this queue may settle by asserting either way. **Its write is deliberately identical to `indisponivel`'s** — no terminal state, no watermark, `erro_codigo = 'cancelamento_pendente'`, the row stays `emitida` and surfaces in the **Sinalizada** band, and the next pass asks again — because operationally the two say the same thing: *we have no confirmation.* The arm exists so the adapter is never forced to launder a definite answer into a refusal, which is the argument that produced `indisponivel` in the first place; collapsing them at the adapter, rather than at the write, is what turns "the vendor lost track of it" into "the prazo has passed, call the accountant."

**And the same adapter obligation applies in the same shape.** A refusal that means *this document is already cancelled* must be returned as `cancelada`, never as `recusada` — otherwise a `cancelar` that succeeded but whose response was lost is re-attempted next pass and its success is recorded as `cancelamento_falhou`, an alert for a problem that does not exist. Which Focus response carries that meaning is on the unverifiable list, in the same homologação session as the `emitir` questions.

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
| `inscricao_municipal` | `text` | yes | Legitimately absent: an immune religious entity is often not municipally registered. **A missing IM must never make `payload.ts` refuse** — that much is a design rule. What it should send instead is *not* decided here: the earlier draft instructed it to send the literal string "não informado", which is a concrete fiscal-field instruction written against a schema nobody in this project has read, and a literal in an IM field is a likely rejection. The candidates are to **omit the field** or to **mark the tomador as não-contribuinte** if the layout carries such a marker. On the unverifiable list with the rest of `payload.ts`. |
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
| `last_attempt_at` | `timestamptz` | The queue cursor, and — since this revision — **a load-bearing predicate**. Written in exactly one statement, the `pendente → enviando` claim, which is the statement immediately before the vendor call; cleared in exactly one statement, the retry out of `erro`, which mints a new ref. So **`last_attempt_at IS NOT NULL` means "the current `provider_ref` was handed to the vendor at least once"**, and that is what the manual and Dispensar guards read. See "A row that has been sent is not a row that can be issued by hand". |
| `estorno_tratado_ate` | `timestamptz` | **The refund watermark.** `received_at` of the newest `charge.refunded` ledger row this nota has already been acted on for. Null means none. |
| `estorno_evento_id` | `text` | That row's `evt_…`. Provenance, and the tie-break that makes the watermark safe. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

**The ref is derived from Stripe, not from us — and the earlier draft's version of this was self-refuting.** That draft minted `nf-{uuid}-1` "with the uuid generated client-side", called it deterministic, and then claimed the vendor layer covers the case *our claim row is lost and the vendor already has the document*. A client-side uuid exists **only on the row**, so if the row is lost the ref is unrecoverable and both "independent" layers were really one layer: the row survived. The concrete failure is not exotic — a Neon incident, a restore from a backup taken before an `emitir` succeeded. `stripe_event` is durable by this spec's own argument, so the claim replays, mints a fresh uuid, Focus sees an unknown ref, and issues a **second nota for the same invoice**.

`nf-{stripe_invoice_id}-{attempt}` fixes it because every input is recoverable from Stripe alone. Three properties follow, and each is load-bearing somewhere else in this document:

- **A lost row reconstructs the same ref.** The vendor refuses (or returns) the existing document under it, and the adapter rule above turns that into a `consultar`, not an `erro`.
- **The attempt sequence replays in order — *if* a rejected ref is consumed at the vendor, which this project has not verified.** If the lost row was on `attempt = 2`, the restore starts again at `nf-{invoice}-1`, the ref of the *rejected* first attempt. The earlier draft said flatly "the vendor refuses it" and then listed "that a *rejected* ref cannot be reused" as unverified two hundred lines later. **The assertion is retracted; the open question is what stands.** If Focus does consume a rejected ref, the walk converges: the refusal is read, a human retries, `attempt` becomes 2, and we arrive at the ref that may hold a document. If it does **not** — and a rejected submission consumes no fiscal number, which is normal issuer behaviour — then `emitir(nf-{invoice}-1)` on the restored row can succeed, and since the fiscal data was corrected before attempt 2 it is now the *acceptable* payload it was not the first time. That is a second nota for one invoice with **neither layer firing**: our unique index died with the row, and the vendor sees a ref it has no live document under. This is the sharpest unclosed edge in the document and it is one of the four homologação experiments.
- **Which makes restore-from-backup a manual reconciliation, not a resume.** Until that experiment is answered, the correct operational response to a restore is to compare the vendor's own document list for the affected period against the restored rows *before* the cron is allowed to run again. That is a runbook sentence rather than machinery, and it is written down because the alternative is discovering it from a duplicate.
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

**The last index is on billing's table, and that is stated rather than smuggled.** The claim and refund sweeps filter `stripe_event` on `type` and `processed_at`; billing indexes only `(church_id, received_at DESC)` and `(outcome)` (billing spec `:109`, re-verified in this revision — the earlier `:113` was off by four). At today's volume a sequential scan is free, but the ledger grows monotonically and these queries run every hour forever, so the index is created **in this subsystem's migration** — it is added for this subsystem's queries and is this subsystem's to maintain. Whoever reviews billing's schema should know it exists.

**The tempting wrong constraint is `UNIQUE (church_id, competencia)`.** "One nota per church per month" reads right and is wrong: a plan change, a proration, or a re-charge after a failure can put two legitimate invoices in one competência, and a cancelled-then-reissued document would collide with itself. The uniqueness that is actually true is **one nota per Stripe invoice**, and that is the index.

### Components, one responsibility each

| Module | Responsibility | May be imported by |
|---|---|---|
| `src/lib/nota/prazo.ts` | **Pure.** `competenciaFrom(periodStart: Date)`, `notaDeadline(competencia)`, `notaUrgency(competencia, pagoEm, now)` — the last returns the **higher** of the deadline level and the age-since-payment level, and the queue sorts on it. Also `NOTA_IDADE_ALERTA`. No I/O, no database. Mirrors `church-status.ts`. | anyone |
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
| `pendente` | Claimed and issuable. **Not necessarily "nothing has been sent"** — that is what the earlier draft said and it was false for one path in this same table: a row returned here by `desconhecida` was sent, and the vendor's not-found is a read, not a proof. `last_attempt_at` distinguishes the two populations and the manual guards read it. | The issue pass claims it → `enviando`. |
| `bloqueada` | Cannot be built: fiscal data missing or unusable. **A retry cannot help; only a human can.** | Saving `church_fiscal` releases that church's rows blocked **for `dados_incompletos` only** → `pendente`. Rows blocked for `moeda_invalida` or `igreja_removida` are deliberately not released by a save, because saving a CNPJ does not make a USD invoice billable in reais or bring a deleted church back — **but neither is left permanently red either: both are ended by hand with Dispensar**, which is what stops a row nothing can drain from teaching Rafael to stop reading the queue. |
| `enviando` | A send began and **we have not read its result.** | **Never re-sent.** The settle pass calls `consultar(ref)`: `emitida` → `emitida`; `processando` → `processando`; `rejeitada` → `erro`; `desconhecida` → back to `pendente`; `indisponivel` → stays. |
| `processando` | The vendor accepted it; the prefeitura has not answered. | The settle pass polls `consultar(ref)`. |
| `emitida` | Done. Number, XML, PDF recorded. | A full refund → cancellation attempt. |
| `erro` | **A refusal we read.** No document exists **under the current ref** — which is why `erro` is the one non-`pendente` state manual registration trusts without further checking. | A human fixes the data and clicks retry, which increments `attempt`, mints a new `provider_ref`, **clears `last_attempt_at`** because that new ref has never been sent, and returns it to `pendente` — in one statement. Or a refund arrives and pass 2 ends it as `dispensada`; see "Cancellation and refund". |
| `cancelada` | Issued, then cancelled at the vendor's confirmation. | Terminal. |
| `cancelamento_falhou` | Cancellation attempted and refused — usually the municipal window closed. | Terminal for the machine. **Alerts loudly**; the resolution is a phone call to the accountant. |
| `manual` | Rafael issued it in the Emissor Nacional or the prefeitura and recorded the number. | Terminal. |
| `dispensada` | Deliberately no nota: zero-value invoice, refunded before we issued, or an un-issued row whose church was deleted and dispensed by hand. | Terminal. Recorded as a row so the decision is visible rather than being an absence. |

**The invariant that makes duplicates impossible: `erro` is only ever written from a response we read.** A response we did not read leaves the row in `enviando`. There is **no path from `enviando` to `pendente` except `desconhecida`** — a positive statement by the vendor that the ref does not exist. No timeout, no age, no operator button may move a row out of `enviando` by assumption. This is the sentence to defend in review.

**The age gate in the settle pass does not contradict that sentence, and the earlier draft failed to say why.** That draft stated the invariant absolutely, then had the settle pass select `enviando` rows "older than a few minutes" — an unspecified number doing exactly the job the invariant forbids, on a vendor property nobody had checked. Two corrections, and they are separable:

- **The threshold governs *when we ask*, never *what we conclude*.** `NOTA_SETTLE_DELAY` is a named constant, **5 minutes** to start, and it is a politeness margin on the vendor's indexing lag, not evidence about the document. A row below the threshold is simply not selected this pass; the next pass asks. Nothing about the age is ever written to the row, and no age ever produces a state change.
- **`desconhecida` is only proof if Focus does not return not-found for an in-flight ref.** The earlier draft's unverifiable list asked whether a rejected ref can be reused, but never asked the question the design actually rests on. It is now on the list, and it is the *first* homologação experiment, not the last.

**And if that experiment comes back badly, the design survives — because of the derived ref.** Suppose Focus does return not-found for a ref submitted seconds ago and our threshold is too short. The row goes `enviando → pendente`, and the re-send carries **the same `provider_ref`**, because `desconhecida` does not increment `attempt`. The vendor's own uniqueness on that ref then refuses the second issuance, and the adapter rule turns that refusal into a `consultar`. **On the automatic path**, a wrong `desconhecida` costs one wasted call, not a duplicate document. This is the concrete payoff of finding-1's fix, and it is why the threshold can be a starting number rather than a researched one — but the experiment still has to be run, because a wrong `desconhecida` that the vendor *did not* deduplicate would be a duplicate nota.

**That defence is vendor-side, and the earlier draft stated it as though it covered everything. It does not, and the gap it left is the worst one in the document.** Deduplication happens *at Focus*, on a ref Focus holds. **The manual path never touches Focus at all.** So the sentence above is true of a re-send and false of a human, and the earlier draft's `pendente` row — "Claimed. Nothing has been sent." — invited exactly the human it was false for.

### A row that has been sent is not a row that can be issued by hand

The constructible failure, in full, because it ends in the one outcome this document exists to prevent. A row is sent at T. Focus's indexing lags. The settle pass asks at T+5min and gets not-found — the case the unverifiable list admits is unchecked and is homologação experiment #1. The row goes back to `pendente`, and the queue shows **Pendente** with a deadline running. Rafael, correctly reading that as "nothing was sent", issues the nota by hand at the free emissor and clicks **Registrar nota emitida à mão**. The row goes `manual`, which is terminal and is never selected by the settle pass again. Focus's document then lands. **Two notas, two providers, and our ledger can never discover the second.** The same hole was open on **Dispensar** for an orphan `pendente` row: terminal, un-queried, and the document lost.

**The distinguishing fact already exists on the row and needed no new state to expose.** `last_attempt_at` is written in the `pendente → enviando` claim, which is the statement immediately before the vendor call — so a row that was ever handed to Focus under its current ref carries a non-null `last_attempt_at`, and a row that never was carries null. Two adjustments make that predicate exactly true rather than approximately true, and both are corrections of writes this design already had:

- **The issue pass builds the payload *before* it claims the row**, so a row blocked for missing fiscal data never acquires a `last_attempt_at` it did not earn. Without this the normal case — a church that pays before sending its CNPJ — would be indistinguishable from a sent row. See "3 · Issue".
- **The retry out of `erro` clears `last_attempt_at`** in the same statement that mints the new ref. `erro` is a refusal we read, so the old ref provably holds no document, and the new ref has never been sent.

The guard is therefore one clause: **`AND (status = 'erro' OR last_attempt_at IS NULL)`**, on top of the state list each write already had. In words: *nothing may end a row while a vendor call is outstanding against its current ref.* `erro` qualifies because it is a refusal we read; `bloqueada` and `pendente` qualify only when nothing was sent.

**Revision 2 wrote that sentence as "a human may end a row by hand only when…", and the narrower wording is what let three writes escape it.** The predicate is not about humans. It is about whether a document may exist under this ref, which does not depend on who is asking — so the clause belongs on **every** write that ends a row terminally, including the refund pass's `dispensada` arm, which is a machine, and the partial-refund arm, which reaches the same rows by a different route. All three now carry it, and the refund pass's zero-row case defers exactly as its `enviando` arm does. See "Cancellation and refund" and the write table.

**And the row is not stranded, which is the property that makes the refusal honest rather than merely safe.** A `pendente` row carrying a `last_attempt_at` is exactly the row the automatic path handles best: the issue pass re-sends it with **the same ref**, and either Focus issues it once or the adapter turns the duplicate-ref refusal into a `consultar` and the row lands on the document that already exists. **Emitir agora** forces that immediately. The row leaves the refused set by being answered — `emitida` (done) or `erro` (a read refusal, now registrable) — never by a timeout and never by an operator's assertion.

**The one case that is genuinely irreducible is stated rather than engineered away.** If Focus is permanently gone while a ref may hold a document, no amount of asking will answer it, and issuing by hand at the free emissor is a real duplicate risk that this system cannot see. The check available to Rafael is outside this system: the document, if it exists, was issued **under his own CNPJ**, so it is in his municipal records. The refusal message says so. That is a worse day than the earlier draft implied, and it is the true one.

**Why `enviando` and `processando` are two states and not one.** They differ in what the recovery does and in what a failure means. `enviando` means *we do not know whether the vendor received it* — the recovery is a lookup that may return `desconhecida`. `processando` means *the vendor confirmed receipt* — `desconhecida` from that state would be a vendor bug, not a normal outcome, and should be surfaced as one. Merging them would make the queue treat "possibly never sent" and "definitely sent, awaiting the prefeitura" identically.

**Why a retry out of `erro` may mint a new ref without weakening anything.** A rejected ref is consumed at the vendor: asking again returns the same rejection forever. But the guarantee this document makes is not "one ref per invoice" — it is **one nota per invoice**, enforced by `nota_fiscal_stripe_invoice_uq`. A new ref is only ever minted from a state that, by the invariant above, is known to have produced no fiscal document. Old refs stay reconstructible as `nf-{stripe_invoice_id}-{n}` for any `n < attempt` **from Stripe alone**, so no history column is needed and a restored database can still walk the sequence.

**That sentence holds for a live database and not for a restored one, and the distinction is not pedantic.** "Minted from a state known to have produced no document" is a claim about `nota_fiscal`. After a restore the row is gone, so `attempt = 1` is minted from **no state at all** — the claim pass cannot know whether the lost row had reached attempt 2, and it has nothing to read that would tell it. Whether that is safe depends entirely on the unverified vendor property above. This is the same edge as the second bullet in "The ref is derived from Stripe", named twice on purpose.

**The one input that must never reach this path is a duplicate-ref refusal.** It arrives looking like a rejection and means the opposite. The adapter, not the state machine, is where that is caught — see "The seam" — because the state machine cannot tell one vendor error code from another and should not learn to.

## The issuing passes

`POST /api/nota/processar`, `CRON_SECRET`-guarded, `export const maxDuration = 60`. **Hourly**, not daily.

**Why hourly, when billing reconciles daily.** Billing's clock is a 7-day grace period; a day of latency is nothing. This clock is the placeholder deadline, and the *correction* window after a wrong issuance is shorter still. A nota that first fails at 23:00 on the 31st has roughly 120 automatic attempts before the placeholder deadline at hourly cadence, and five at daily. The cost is about 24 no-op queries a day at this volume.

**Hourly is a hosting-plan requirement, not a line in a config file, and "done" includes the plan.** The repo has no `vercel.json` today (verified: `ls vercel.json` fails; billing spec `:620` says it creates the first one — the earlier `:618` was off by two), so the cron entry joins billing's daily one in a file billing introduces. But a schedule in `vercel.json` is a *request*: **Vercel's lower plan tiers coarsen cron triggers to roughly once per day regardless of the expression written**, which would silently reduce the 120 attempts above to about five and delete the entire justification for this cadence. The exact current limits are a vendor fact this spec has not verified and must not assert — **confirming them, and being on a plan that honours a sub-daily schedule, is a launch prerequisite listed under "Vendor and legal configuration".**

If the answer is that hourly is unavailable, the degraded mode is stated rather than discovered: the cadence becomes daily, `nota_run` still exposes it, and the two manual triggers that already exist — the **Processar fila agora** button in `/owner` and `npm run nota:processar` — become load-bearing rather than diagnostic. That is a materially worse deadline story and Rafael should choose it knowingly.

Four passes per run, in order, each bounded and each resumable.

**The order is claim → refund → issue → settle, and pass 2 moved there to close a real hole.** An earlier draft ran claim → issue → settle with refunds handled inside settle, while asserting in the cancellation section that we "never issue a nota for a payment that was already refunded". Those two statements cannot both be true: an invoice paid and refunded inside one hourly window is claimed `pendente` in pass 1, **issued in pass 2**, and only then does pass 3 discover the refund — forcing a cancellation inside a municipal window minutes after issuance, which is the most expensive outcome this document has. Sweeping refunds before the issue pass makes the guarantee real for every refund visible when the run starts.

**The residual window, stated rather than glossed.** A refund that arrives *during* a run, after the refund pass has passed the row, is still issued. That window is one pass instead of one hour, and it lands on the `emitida` → `cancelar` path, which is the path that exists for exactly this. The guarantee is therefore "never issue against a refund we can see", not "never issue against a refund", and it is written that way below.

**A second population takes the same path, deliberately, and it is named here rather than only where it is decided.** A refund landing on a row that was already sent and never confirmed is **not** acted on by pass 2 — writing a terminal *no document was issued* about a ref that may hold one is the failure this whole design is organised against. So the row goes on to pass 3, is re-sent under **the same ref**, and reaches `emitida` or `erro` within a pass; the refund is still unconsumed and the next run cancels or dispenses it. The cost is a document that may be issued against a visible refund and cancelled an hour later; the thing bought is that no row ever asserts the absence of a document nobody has asked about. See "Cancellation and refund".

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

**The `ON CONFLICT` names one of the table's two unique indexes, and the other one has to be accounted for rather than left to raise.** `nota_fiscal_provider_ref_uq` is not covered by that clause, so a collision on it aborts the statement instead of being absorbed. Under the derived form that cannot happen — the ref embeds the invoice id, so any `provider_ref` collision implies a `stripe_invoice_id` collision, which the clause already absorbs. Under the **sha256 fallback** it can: two different invoice ids can share the first 16 hex characters. The rule is therefore: the claim catches a unique violation on `nota_fiscal_provider_ref_uq` and surfaces it as a named pt-BR error in `/owner` — the `src/app/owner/(protected)/[churchId]/actions.ts:37-42` pattern — rather than as a 500 in a cron log nobody reads. **And the derivation choice must be pinned before the first production issuance**, which is why it is an owner decision and a prerequisite: switching from the derived form to the hash mid-life gives one invoice two reconstructible refs, and layer two of the idempotency argument is silently deleted for every row issued before the switch.

**There is no window in which a nota is issued but unclaimed**, because issuance is gated on a claimed row and the claim is one statement with a unique index behind it. A crash before the insert loses nothing at all — the `stripe_event` row is the durable trigger and the next pass re-runs the same query. A crash after it leaves a `pendente` row, which is exactly what the next pass drains.

**The timezone conversion is not a detail.** `period_start` is a Unix timestamp. A payment at 02:00 UTC on 1 February is 23:00 on 31 January in São Paulo, and computing the competência in UTC would file it under the wrong month, in the wrong deadline window, in the wrong PGDAS-D period. `competenciaFrom` is pure and gets its own boundary tests.

**A zero-value invoice records a `dispensada` row rather than skipping.** Whether a nota is owed for a zero-value service is contested and is on the accountant's list; recording the decision as a visible row is how it gets revisited, and silently skipping is how it never does.

### 2 · Refund

Full detail is in "Cancellation and refund"; what belongs here is its place in the order and its selection. Select `charge.refunded` rows from `stripe_event` whose charge resolves to a `nota_fiscal` row that has **not already been acted on for that event** — the watermark comparison `(ev.received_at, ev.id) > (nf.estorno_tratado_ate, nf.estorno_evento_id)`, with a null watermark matching everything. Apply the action table by the nota's state. Every arm that reaches a decision writes the watermark **in the same statement as the state change**, so a refund is consumed exactly once; the two arms that deliberately defer (`enviando`, `processando`) write nothing at all and are re-selected next pass, which is correct because the row will have settled by then.

A `charge.refunded` whose invoice has **no** `nota_fiscal` row is a no-op with no watermark to write, so it is re-queried every hour. That is deliberate and it is not an alert: it is the case where billing has not yet bound the event to a church, and it means the refund is still waiting when the claim pass finally creates the row. One indexed query an hour is the price of not needing replay machinery for that repair.

### 3 · Issue

**Before selecting anything, the pass checks `DESCRICAO_APROVADA` in `src/lib/nota/servico.ts`. While it is `false`, the pass does no work at all** and records the reason in `nota_run.last_result`, which `/owner` shows as a banner at the top of the queue. Rows stay `pendente` and keep accruing visible deadline pressure. See "On the nota itself" for why this gate sits here rather than in the payload builder.

Select `pendente` rows, `ORDER BY last_attempt_at ASC NULLS FIRST, id ASC`, capped at `NOTA_BATCH`. The ordering and cap reasoning is billing's, unchanged and not re-derived here: an unordered uncapped walk that dies on a timeout dies at the same place every run, so its tail is never processed at all.

Per row, and **the order of these two steps is load-bearing** — it changed in this revision:

**First, build the payload** from `church_fiscal` and vendor config. This is a read; it claims nothing. If it cannot be built — no `church_fiscal` row, a required field empty, a malformed CNPJ — one statement moves the row to `bloqueada` with the reason, guarded `AND status = 'pendente'`, **and the vendor is never called.**

**Then, and only then, claim it:**

```sql
UPDATE nota_fiscal
   SET status = 'enviando', last_attempt_at = now()
 WHERE id = $1 AND status = 'pendente'
RETURNING id
```

Zero rows returned means another lambda claimed it; skip. **This is the one place the nota subsystem is stricter than billing, and the reason is worth stating**: billing's attempt marker is a separate statement carrying no invariant, because its redundant work is an idempotent `UPDATE`. Here the marker *is* the mutual exclusion, because the redundant work is a fiscal document. One statement, conditional on the current state, doing both jobs.

**Why the build moved in front of the claim.** The earlier draft claimed first and built second, so a row blocked for missing fiscal data — the normal case, a church that paid before sending its CNPJ — passed through `enviando` and came out of it carrying a `last_attempt_at` for a vendor call that never happened. That made `last_attempt_at` mean "we looked at this row", which is worth nothing, instead of "a send of this ref began", which is worth the manual guard built on it in "A row that has been sent is not a row that can be issued by hand". Reordering costs nothing — two lambdas may both build a payload for one row, and a payload build is a read — and it makes the column's documented meaning literally true. Two lambdas still cannot both send, because the claim is unchanged.

Then `emitir(ref, input)`, and one statement records the outcome by its arm: `emitida` → `emitida` with `numero`, `codigo_verificacao`, `chave_acesso`, `url_pdf`, `xml`, `issued_at`, `tomador_cnpj`, `tomador_razao_social`; `processando` → `processando`; `rejeitada` → `erro` with code and message; `indisponivel` → **no write at all**, the row stays `enviando` and pass 4 owns it from here; **`desconhecida` → treated exactly as `indisponivel`: no write at all, the row stays `enviando`.**

**That fifth arm is not a formality, and its absence was a live hazard.** `NotaOutcome` has five arms and the earlier draft's issue pass enumerated four, so under TS strict an implementer had to invent the fifth — and the only precedent in the document, the settle pass, maps `desconhecida` to `pendente`. That would be precisely wrong here. The adapter is *required* to resolve a duplicate-ref refusal by calling `consultar(ref)`, and that lookup runs with **zero delay** against the very indexing lag `NOTA_SETTLE_DELAY` exists for, so a `desconhecida` arriving out of `emitir` is the least trustworthy not-found this system can produce. Writing `pendente` from it would return a just-sent row to the issue queue. Staying in `enviando` costs one settle pass and is the same answer `indisponivel` gets, for the same reason: **we do not know.**

### 4 · Settle

Select `enviando` rows older than **`NOTA_SETTLE_DELAY`, a named constant, 5 minutes to start**, plus all `processando` rows, same ordering and cap. Call `consultar(ref)` and apply the state table. **`consultar` is a read; it can be called any number of times — recording its answer cannot**, which is why the outcome writes carry `AND status = 'enviando'` (or `'processando'`) in the write table, and why the on-demand **Consultar no emissor** action carries the status the request itself observed.

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
| Block before sending | `AND status = 'pendente'` | Another lambda claimed it for sending; skip. |
| `pendente → enviando` | `AND status = 'pendente'` | Another lambda has it. |
| **Emitir agora** | the issue pass narrowed to one id: the same payload-build-then-`AND status = 'pendente'` claim, behind the same `DESCRICAO_APROVADA` gate | **Refuse, verbatim pt-BR.** |
| Outcome writes | `AND status = 'enviando'` (or `'processando'` for the settle arms) | The row moved; re-read and let the next pass own it. |
| **Consultar no emissor** | `AND status = $status_lido` — the status read from the row in the same request, immediately before `consultar` was called — with `RETURNING`. Only the `emitida` / `rejeitada` / `processando` arms write at all | **Refuse, verbatim pt-BR.** The row moved while the vendor was being asked; nothing is written and nothing is concluded. |
| Retry from `erro` | `AND status = 'erro'` | Refuse, verbatim pt-BR. |
| Release on save | `AND status = 'bloqueada' AND erro_codigo = 'dados_incompletos'` | Nothing to release; the count is what the message prints. |
| **Manual registration** | `AND status IN ('pendente','bloqueada','erro') AND (status = 'erro' OR last_attempt_at IS NULL)` | **Refuse, verbatim pt-BR.** |
| **Dispensar** | `AND status IN ('pendente','bloqueada','erro') AND (status = 'erro' OR last_attempt_at IS NULL)` plus its own offer condition (`church_id IS NULL` or `erro_codigo = 'moeda_invalida'`) | **Refuse, verbatim pt-BR.** |
| **Refund → `dispensada`** (full *or* partial) | `AND status IN ('pendente','bloqueada','erro') AND (status = 'erro' OR last_attempt_at IS NULL)`, plus the watermark in the same `SET` | Do nothing this pass; **no watermark**; re-evaluated next pass. |
| **Partial refund → flag** | `AND status = 'emitida'`, plus the watermark in the same `SET` | The row moved; re-evaluated next pass. |
| **Refund → other arms** | the arm's own state, plus the watermark in the same `SET` | Already handled, or the row moved. |

**`Emitir agora` had no row here and no stated state restriction, which was the gap this table's own introduction — "mechanical and there are no exceptions" — promised there would not be.** It is not a new mechanism: it is pass 3 with `AND id = $1` added to the selection, which means it inherits the payload-build-then-claim order, the conditional claim, and the `DESCRICAO_APROVADA` gate. Inheriting the gate is the part worth naming, because a button that skipped it would be a hand-operated way to file the one document the gate exists to prevent.

**`Consultar no emissor` had no row here either, and its absence was worse than `Emitir agora`'s because the action was invented one revision ago to be the escape hatch a refusal points Rafael at.** The prose said `consultar` "is a read and may be called any number of times, which is why it needs no state guard of its own" — true of the *call* and false of the three writes that follow it. `consultar` is a read; **recording its answer is not.** The gap between the two is a network round-trip, and the hourly pass runs in it: Rafael asks about a `pendente` row, the cron claims the row and re-sends it, and the answer to the *old* question lands as a fresh `erro` on a row that is mid-flight — from which **Tentar novamente** mints a second ref and **Registrar à mão** is explicitly permitted. So the write carries the status the request itself read, not a status list: `AND status = $status_lido`. Zero rows is not an error condition to smooth over, it is the correct answer — *you asked about a row that no longer exists in the state you asked about* — and the pt-BR refusal says exactly that.

**The two refund rows carry the same `last_attempt_at` clause the human writes carry, and that is a propagation rather than a new rule.** Revision 2 named a population — a row that has been sent at least once and whose outcome is unconfirmed — and guarded the two writes a *human* can reach. It did not guard the write the *machine* reaches, which ends the same row terminally, writes the watermark, and prints in pt-BR that no document was issued. A predicate that is only enforced on the paths a human happens to take is not an invariant; it is a habit. Every write that can end a row terminally now reads the same clause, and the question each one answers is the same question: **may a document already exist under this ref?** — which does not depend on who is asking or on how much money came back.

The concurrency-shaped writes are tested as concurrency tests — two simultaneous calls, exactly one wins — not behavioural ones, because a behavioural test passes against read-check-then-write code and proves nothing about the failure that matters.

## Tax data: collected where, by whom, and what happens when it is missing

**A church that pays before supplying its CNPJ is the normal case.** Rafael provisions a church, connects its number, generates a Checkout link, and the first charge lands days before anyone thinks about the cartão CNPJ. The design assumes this rather than tolerating it.

**Collection** is a **Dados fiscais** card on `/owner/[churchId]`, owner-only, typed by Rafael from the church's cartão CNPJ. Validation is client-and-server: CNPJ exactly 14 digits after stripping punctuation, CEP exactly 8, IBGE code exactly 7, UF two letters, a syntactically valid e-mail. One extra check that is not cosmetic: **the fiscal e-mail is refused if it equals any `admin_user.email` for that church**, with a message saying why. A fiscal document sent to a login address is wrong on both fiscal and LGPD grounds, and it is the mistake that will be made.

`provisionChurch` is **not** changed. Requiring fiscal data at creation would block Rafael from provisioning before the CNPJ card exists, which is the wrong order. The cost of that choice — a church quietly missing fiscal data — is paid off in the church list, which shows a **Sem dados fiscais** badge from the day the church is created, not from the day its first payment lands.

**When a payment lands and the data is missing**, the claim still happens. The row exists, with the right competência, the right amount and the right invoice id. **It is claimed `pendente` and blocked by the issue pass, not blocked at claim time** — the claim statement never reads `church_fiscal`, and its only two non-`pendente` outcomes are `dispensada` for a zero value and `bloqueada` for a non-BRL currency. So the row spends up to one pass in `pendente` before the payload build refuses it and moves it to `bloqueada` with `dados_incompletos`. The earlier draft wrote this as though the claim did the blocking, which contradicted its own SQL. Either way it is in the queue with a visible deadline, nothing is lost, and nothing has to be reconstructed later from Stripe — **and, since this revision, it reaches `bloqueada` without ever having been handed to the vendor, which is what keeps it registrable by hand.**

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

The clock here is shorter than the issuance clock and that is what shapes the whole section. Correction and cancellation windows are municipal and tight. **The specific figures below are secondary-source readings on the unverifiable list, not checked citations, and the section is built so that none of it depends on them being right:** SP is said to allow substitution for a limited period that cannot cross the ISSQN due date for the competência, and one municipal rule found allows 10 days subject to that same cap. What the design actually uses is only the *shape* of the claim — **a wrong nota is cheaply fixable for days, not weeks** — which is why the cancellation path is prompt and loud rather than tuned to a number.

A `charge.refunded` row in `stripe_event` is picked up by **pass 2, which runs before the issue pass** (see "The issuing passes" for why that ordering is load-bearing). The charge is retrieved to find its `invoice`, and the nota is found by `stripe_invoice_id`. Then, by the nota's state.

**How a full refund is told from a partial one — which this document pivoted on for two revisions without ever saying.** Cancel-versus-flag, the whole table below, and the `estorno_parcial` reason code all turn on the distinction, and no field was ever named. It is read off the same `charges.retrieve(ch_…)` the pass already makes: **a refund is full when `charge.amount_refunded >= charge.amount`, and partial otherwise.** One comparison, on the object already in hand, adding no call and no column. Two cautions travel with it and both are on the unverifiable list rather than resolved here: `charge.amount` is the charge's amount and not necessarily the invoice's `amount_paid` against a partially-credited invoice — the field question already listed for the claim pass, arriving a second time on a decision that ends in a cancellation window — and a sequence of partial refunds that eventually sums to the whole is a `charge.refunded` event whose own `amount_refunded` finally equals `amount`, which this rule reads as full, correctly, only if Stripe emits that event. **Neither is asserted.** What the design does not do is guess: if the comparison cannot be made — the charge cannot be retrieved, the fields are absent — the pass writes nothing and no watermark, and the row is re-selected next pass, which is the same answer every other *we do not know* gets in this document.

| Nota state | Action | Writes the watermark? |
|---|---|---|
| `emitida` | Attempt `cancelar(ref, motivo)`. `cancelada` → `cancelada`. `recusada` (**a refusal we read**) → **`cancelamento_falhou`**, top of the queue, copy that names the prazo and tells Rafael to call the accountant. `indisponivel` **and `desconhecida`** → **no terminal state**: write `erro_codigo = 'cancelamento_pendente'`, leave the row `emitida`, try again next pass. | `cancelada` and `recusada`: yes, with the outcome. `indisponivel` and `desconhecida`: **no** — nothing was decided. |
| `pendente` / `bloqueada` / **`erro`**, **and `(status = 'erro' OR last_attempt_at IS NULL)`** | → `dispensada`, reason `estornada`. **Never issue a nota for a refund we can see.** | Yes, in the same statement. |
| `pendente` / `bloqueada` **carrying a `last_attempt_at`** — the sent-but-unconfirmed row | **Do nothing yet**, exactly as `enviando` does and for the identical reason: a document may already exist under this ref, and ending the row terminally would print that none does. | **No** — deliberately, so it is re-selected next pass. |
| `enviando` / `processando` | **Do nothing yet.** Settle it first, then cancel on the following pass. Cancelling a document that may not exist is how one problem becomes two. | **No** — deliberately, so it is re-selected next pass. |
| `dispensada` / `cancelada` | Nothing to cancel and nothing that can become a document. Recorded. | Yes. |
| `cancelamento_falhou` | **Nothing.** Already terminal, already alerting loudly, already Rafael's phone call. The vendor is **not** called again — a cancellation the prefeitura refused does not become acceptable by being asked hourly, and a re-attempt would only replace one refusal message with an identical one. | Yes. |
| `manual` | **Flagged for Rafael, never automated**, reason `estorno_manual`. We did not issue it, we do not know where it lives, and we must not claim to have cancelled it. | Yes — the flag is raised once, not every hour. |

**`erro` moved out of the "nothing to do" arm, and the reason is the worst bug this spec has had.** The earlier draft grouped `erro` with `dispensada` and `cancelada` as *nothing to cancel, recorded, watermark written* — reasoning, correctly, that no document exists. But `erro` is **not terminal**: it is the one state with a human button on it that leads back to issuance. Nota rejected → row sits in `erro`; the church is refunded; pass 2 writes the watermark and changes nothing; Rafael later fixes the CNPJ and clicks **Tentar novamente**; pass 3 issues **a real fiscal document for money that was returned.** The refund event is watermarked, so it is never re-selected; the `emitida → cancelar` backstop never fires because the refund was consumed while the row was still `erro`; and the resulting row sits in the collapsed "everything issued" band. It violates this document's own stated guarantee — *never issue a nota for a refund we can see* — at the exact line that claims it.

**And the watermark introduced to close an earlier finding is what removed the detector.** Before it, this refund was re-detected hourly forever; the re-detection was noise, but it was also the only thing standing between an `erro` row and that document. Closing finding 5 by consuming the event silenced the noise *and* the alarm. **This is the pattern this project keeps repeating — a fix that shrinks a defect while making it invisible — and it is why the watermark must never be written by an arm that leaves a row able to become a document.** The fix is the smallest one available: `erro` joins `pendente` / `bloqueada` and the row ends `dispensada` / `estornada`, which is terminal, is visible as a recorded decision, and takes both the retry button (`AND status = 'erro'`) and manual registration out of reach by state alone.

**The rest of the table was re-audited against that rule, and the re-audit used the wrong rule — which is this revision's own finding against the last one.** The question asked was *can a button issue a document from the row this arm leaves?* Under it, `dispensada` on a `pendente` row passes: nothing issues from `dispensada`. The question that had to be asked is the one Revision 2 had just introduced two paragraphs earlier and did not carry across: **may a document already exist under this ref?** A row is `pendente` for two different reasons — never sent, or sent and answered *not-found* by a vendor that may simply have been indexing — and the second is not a row about which anything terminal may be written.

**The concrete failure, because it is the one this whole document exists to prevent.** Ref `-1` is sent at T. The settle pass asks at T+5min, Focus returns `desconhecida`, the row goes back to `pendente` carrying its `last_attempt_at`. The church is refunded. Pass 2 writes `dispensada` / `estornada` **and the watermark**, in one statement, terminally. Focus's document then lands. The settle pass selects only `enviando` and `processando`, so ref `-1` is never asked about again; the `emitida → cancelar` backstop cannot fire because the row is not `emitida`; the event is consumed, so nothing re-detects it; and the row prints `Dispensada: cobrança estornada antes da emissão.` — a false pt-BR statement about a real fiscal document, for money that was returned, in a band that collapses. Every property that made the `erro` bug bad, arriving through the fix for a different one.

**So the arm splits on the predicate rather than on the state name, and the deferred half is not stranded.** A `pendente` row carrying a `last_attempt_at` is exactly the row the automatic path handles best: the issue pass re-sends it **with the same ref**, and either the adapter's duplicate-ref rule turns Focus's refusal into a `consultar` and the row lands on the document that already exists, or the document really never existed and one is filed. Either way the row reaches `emitida` or `erro` within a pass, the refund is still unconsumed, and the next pass's `emitida` arm cancels it or the `erro` arm dispenses it. **A `bloqueada` row carrying a `last_attempt_at` is the one the issue pass will not move** — it selects only `pendente` — and it is ended by **Consultar no emissor**, which is why that action's own guard is fixed in this same revision rather than a later one.

**That leaves one honest cost, stated rather than buried, because it is a real document.** In the case where the `desconhecida` was true — nothing was ever created — the re-send files a nota for money that has already been returned, and it is cancelled on the following pass. The guarantee is therefore still *never issue against a refund we can see*, with one named exception: **a row we cannot yet prove has no document is issued once more, deliberately, to find out.** The trade is a nota cancelled within an hour, well inside the window this section calls days rather than weeks, against a terminal row that lies about a document nobody can ever cancel. And it answers the visibility question the right way: the outcome is `cancelada`, or it is `cancelamento_falhou` at the top of the queue — both true, both loud — where the alternative was a collapsed row asserting that no document exists.

**The remaining arms, re-audited against the correct predicate this time.** `emitida` moves state (and, on `indisponivel` or `desconhecida`, deliberately does not consume the event). `dispensada` and `cancelada` are terminal and were reached by a write that already carried this clause. `cancelamento_falhou` is terminal and its document is recorded. `manual` is terminal and issuance is over — and it is reached only through a write that already refuses a sent-but-unconfirmed row, which is what makes consuming the event there safe. The release-on-save statement cannot resurrect any of them: it is keyed on `status = 'bloqueada'`, and a refunded `bloqueada` row is either already `dispensada` or was deliberately left alone. **`enviando`, `processando` and the sent-but-unconfirmed half of `pendente`/`bloqueada` are the arms that consume nothing, which is correct and is why they alone are re-selected.**

**`cancelamento_falhou` was missing from this table entirely in the earlier draft**, which left it ambiguous between two bad readings: re-attempt the cancellation against the vendor every hour forever, or skip it silently. It is now an explicit no-vendor-call arm that consumes the refund event, and the row keeps its position at the top of the queue on its own state, not on repeated detection.

**The watermark column is what makes the no-state-change arms survivable.** `emitida → cancelada` self-limits because the state moves. `manual`, `cancelamento_falhou` and a partial refund change no state, so without a marker each would be re-detected and re-flagged on every hourly run forever — a permanently red row for a decision Rafael already made, which is precisely the "trains him to ignore the queue" failure the `manual` state exists to prevent. The write is `SET erro_codigo = $reason, estorno_tratado_ate = $ev_received_at, estorno_evento_id = $ev_id WHERE id = $1 AND status = $expected`, one statement, and the watermark never advances without the decision it records.

**The converse is the rule this revision had to add: a flag may be raised without the watermark, and one arm needs exactly that.** A `cancelar` that returns `indisponivel` decided nothing, so it must not consume the event — but the row stays `emitida`, and `emitida` is the collapsed band, so without a flag a refund whose cancellation the vendor never answers would retry hourly *and be invisible while it did*. So that arm writes `erro_codigo = 'cancelamento_pendente'` and **no watermark**: the row surfaces in the **Sinalizada** band on its flag, and is re-selected next pass on its missing watermark. Same two columns, no new state, and the failure is loud while it lasts.

**A partial refund never cancels anything, and — this revision — it runs the same action table rather than a sentence written for one state.** The correct instrument is a substituting nota at the reduced value, which is a different operation with its own window and its own service-code implications; the reasoning is on the accountant's list. So the partial path is **the table above with exactly two substitutions**: the `emitida` arm **flags instead of calling `cancelar`**, and every arm that writes `dispensada` writes reason **`estorno_parcial`** instead of `estornada`. Everything else is identical — the guards, the two deferring arms, the `(status = 'erro' OR last_attempt_at IS NULL)` clause, the watermark rule — because *may a document already exist under this ref?* does not depend on how much money came back.

**That is a correction, not a restatement, and the paragraph it replaces was written as though `charge.refunded` only ever lands on `emitida`.** It does not. It lands on `pendente`, on `bloqueada` and on `erro` — the church that was refunded before its CNPJ ever arrived is the ordinary case, not the exotic one — and under the old wording the row **stayed in the state it was in**, the watermark advanced, and the next issue pass filed a nota at the **full** `valor_centavos` for a partially refunded payment, with the event consumed so nothing would ever re-detect it. **On a `bloqueada` row it was worse in a second, quieter way:** writing `erro_codigo = 'estorno_parcial'` overwrote `dados_incompletos`, and the release-on-save statement filters on exactly that value — so saving the church's CNPJ would silently release nothing, forever, on a row with no Dispensar offer either (`church_id` is not null and the code is not `moeda_invalida`). A permanently red row that no save and no button can end, produced by a flag.

**Under the substitution rule both disappear without a new state or a new code.** A not-yet-issued row ends `dispensada` / `estorno_parcial` — terminal, so nothing issues at the full value; carrying its reason, so the decision is legible; and reaching a terminal state means the release-on-save filter is out of scope rather than corrupted. `dispensada` is the right word for it precisely because of what this document already says Dispensar means: it records that no document was issued and why, and it **does not decide whether one is still owed** at the reduced value. That is the accountant's question, and the row is the artifact that keeps it askable.

**The row stays in the state it was in only where that sentence was ever true** — an `emitida` row remains `emitida`, because the document it names is still valid — so the church-facing list is unchanged and correct, and the flag shows only in `/owner`. The queue gains a **Sinalizada** band for rows carrying a flag in a non-error state, so a flagged `emitida` row is visible rather than collapsed into "Everything issued"; a `dispensada` / `estorno_parcial` row carries the same flag and lands in the same band, which is what keeps a partial refund on a never-issued nota from being filed under *decided* and forgotten.

**A dispute triggers nothing.** Billing records `charge.dispute.created` passively and this subsystem inherits that — and deliberately does *not* inherit it for refunds. The divergence is the point: a dispute may resolve in Rafael's favour and the money may never leave, so cancelling a valid nota on the strength of one is an unforced error with a window that will not reopen. A refund is settled fact.

## The owner console

**A platform-wide `/owner/notas` page**, not only a per-church card. The queue crosses churches and is Rafael's daily work; a per-church-only view means visiting every church to find the one that failed.

Rows are ordered by urgency, not by date. **The bands are evaluated in order and the first match wins** — one row, one band, by construction:

1. `cancelamento_falhou` — the window has already closed.
2. `erro` — needs a data fix.
3. **Órfãs** — `church_id IS NULL AND status IN ('pendente','bloqueada')`. Un-issued rows whose church was deleted and that can never drain by themselves; see below.
4. **Sinalizadas** — `erro_codigo IN ('estorno_parcial','estorno_manual','cancelamento_pendente')`, in a non-error state. They are not broken, but they are a decision or an unfinished vendor conversation waiting on Rafael, and the collapsed band would hide them.
5. `bloqueada`, **ordered by urgency descending**.
6. **`enviando` and `processando`** — every row in either, at any age, ordered by urgency descending.
7. `pendente`, **ordered by urgency descending**.
8. Concluídas — `emitida`, `manual`, `cancelada`, `dispensada` — collapsed.

**"Every status maps to exactly one band" was asserted as a testable property and it is false, which matters because the test was specified and cannot be written.** Bands 3 and 4 do not key on status at all — one keys on `church_id`, the other on `erro_codigo` — so a flagged `emitida` row satisfies both 4 and 8, and an orphaned `erro` row satisfies both 2 and 3. Status is not the discriminator and no amount of care over the status list makes it one. **First-match-wins over an ordered list is the fix, and it is one sentence rather than a mechanism**, but it has to be stated because it decides real placements: an orphaned `erro` row belongs to band 2, where the copy is honest about what it needs (it also shows `Igreja removida` and offers **Dispensar**), which is why band 3's predicate excludes `erro` explicitly rather than by accident. The property that is actually true, and the one the test asserts, is **every *row* lands in exactly one band** — asserted over the full enum crossed with orphan and flagged, not over the enum alone.

Each row carries the church, competência, value, deadline, urgency, **the age since the payment**, and the vendor's own message when there is one. Actions per row: **Emitir agora**, **Consultar no emissor**, **Tentar novamente** (only from `erro`), **Registrar nota emitida à mão**, **Dispensar**, **Abrir PDF**, **Baixar XML** — each with the state guard its row in the write table names, and each hidden rather than shown-and-refused when its guard cannot pass.

**Bands 6 and 8 changed because two populations had nowhere to be.** `processando` appeared in no band at all, and neither did an `enviando` row younger than `NOTA_SETTLE_DELAY` — so a row the prefeitura simply never answers was polled forever and displayed nowhere, which is a queue quietly not telling Rafael about an un-issued nota with a deadline. They share band 6 now, at any age, and they carry the same deadline and urgency copy every other un-issued row carries, because **an un-issued row is an un-issued row regardless of who is holding it.** Band 8 was called "everything issued", which was already untrue of `cancelada` and became untrue of `dispensada` the moment a refunded `erro` row started landing there; it is named for what it holds — decided — rather than for what most of it is.

**Age since payment is shown beside the deadline, and — this revision — it is also *sorted on*, which is the half that was missing.** Under advance billing the competência is a *future* month, so `notaDeadline` lands ~35 days out and `notaUrgency` never escalates — on exactly the rows most at risk, the `bloqueada` backlog of a church that has not sent its CNPJ. The previous revision added the column and stopped there, leaving band 5 ordered "past or near its deadline, **then the rest**" — under which a future-deadline blocked row is *the rest*, at the bottom, with `⚠️ O prazo vence em {n} dia(s)` and `🚨 Prazo vencido` still never rendering. A three-month-old blocked row could still look comfortable; it just had a number beside it that nothing read. **A column nobody sorts by is not an alarm, it is a decoration, and adding it while declaring the finding closed is the same shrink-but-hide pattern this document keeps having to unlearn.**

So `notaUrgency` takes the payment date as well: **`notaUrgency(competencia, pagoEm, now)` returns the higher of the deadline-based level and an age-based level**, the second escalating past `NOTA_IDADE_ALERTA` (a named constant in `prazo.ts`, 30 days to start, on the infrastructure line of the unverifiable list with the others). One function, one ladder, two inputs; the bands sort on its output, so the oldest unissued row is at the top of its band and the age copy renders on it. This still does **not** fix the competência convention — that is owner decision 4 and the accountant's answer. It makes the convention's blind spot audible instead of merely printed.

`pagoEm` is the `received_at` of the `stripe_event` row named by `stripe_event_id`, falling back to `nota_fiscal.created_at` when that provenance row is gone — the claim runs within one pass of the event, so the fallback understates the age by at most one pass and never overstates it. No new column.

**Consultar no emissor is `consultar(ref)` on demand, and it is the action every refusal in this document points Rafael at.** Revision 2 defined it because the manual-registration guard leans on it, and defined it wrongly in both halves; this revision fixes the offer condition and the writes.

**The offer condition is `last_attempt_at IS NOT NULL AND status IN ('pendente','bloqueada','enviando','processando')`.** Sent at least once under the current ref, and not yet terminal. The previous wording — "any row whose `last_attempt_at` is set" — put the button on `manual`, on `dispensada` and on `cancelada` rows, every one of which carries a `last_attempt_at` if it passed through the vendor. A `manual` row registered out of `erro` is the concrete case: click Consultar, Focus returns the old `rejeitada`, the row is written back to `erro`, the hand-recorded `numero` is overwritten and the row re-enters the issuance path — a second nota, produced by the action added to prevent one. **A read whose answer is stale is not harmless; writing it down is what makes it harmful**, and the cheapest place to stop that is to not offer the question about a row whose story is over.

**Its outcome writes carry a state guard, and "`consultar` is a read" was the wrong reason to omit one.** The call is a read; **recording the answer is a write**, and between the two sits a network round-trip the hourly pass runs in. So the request reads the row's status, calls the vendor, and writes `AND status = $status_lido` with `RETURNING` — the status it actually observed, not a list. `emitida` → `emitida` with the document recorded; `rejeitada` → `erro`; `processando` → `processando`; `desconhecida` / `indisponivel` → **no write at all**. Zero rows is a refusal in verbatim pt-BR, and it is the correct answer rather than an inconvenience: the row is no longer in the state the question was asked about.

**Both readings of the un-guarded version were broken, which is why neither could simply be picked.** Reusing the settle pass's guards (`AND status = 'enviando'`) makes the action **inert** on exactly the `pendente` and `bloqueada` rows this section says it rescues — the blocked orphan would have no ending after all, and the test that says a `rejeitada` lands such a row in `erro` could not pass. Widening the guard to nothing makes it the one state-changing write with no row in a table whose own introduction says "mechanical and there are no exceptions" — and then Rafael clicking Consultar on a `pendente` row while the cron claims and re-sends it writes a **stale `erro`**, from which manual registration is explicitly permitted and **Tentar novamente** mints a second ref. `AND status = $status_lido` is the third answer: it moves the `pendente`/`bloqueada` row when nothing else is happening to it, and it refuses precisely when something is.

**`desconhecida` writing nothing is a deliberate divergence from the settle pass, not an oversight.** The settle pass maps `desconhecida` on an `enviando` row to `pendente`, but it only asks after `NOTA_SETTLE_DELAY`; Consultar has no such delay and can be clicked seconds after a send. Its not-found is therefore the least trustworthy this system can produce — the same argument that gave `emitir`'s `desconhecida` arm no write — so it leaves the row where it is and lets the settle pass, which waited, be the one that concludes anything from a not-found.

That makes it the one thing that unsticks a sent-but-unconfirmed row, and it is worth following that path to its end rather than stopping at the happy case. A row that was sent, answered not-found, returned to `pendente` and then blocked for missing fiscal data — an orphan whose church was deleted is the realistic instance — is refused by both terminal-by-hand actions. **Consultar** moves it the moment Focus gives a definite answer: to `emitida` (the document existed after all, and is now recorded), or to `erro` (a refusal we read, from which Dispensar and manual registration are both allowed again).

**And if Focus never gives a definite answer, the row stays open, visibly, and this document will not pretend otherwise.** That is a small population — a row that got a not-found from a vendor that subsequently went dark — and closing it by hand would mean asserting something nobody knows about a fiscal document. It is ended by answering the vendor question outside the queue (a restored account, an export, a support ticket) or by the municipal check under Rafael's own CNPJ. A permanently open row is a bad outcome; **a permanently open row that Rafael closed on a guess, and a second nota under it, is a worse one.**

**Manual registration** takes `numero`, an optional `codigo_verificacao`, an optional PDF link and a date. It is **one conditional statement**, not a read followed by a write:

```sql
UPDATE nota_fiscal
   SET status = 'manual', provider = 'manual', numero = $2,
       codigo_verificacao = $3, url_pdf = $4, issued_at = $5
 WHERE id = $1
   AND status IN ('pendente','bloqueada','erro')
   AND (status = 'erro' OR last_attempt_at IS NULL)
RETURNING id
```

**The second clause is this revision's, and it is the guard against the two-notas-two-providers case in "A row that has been sent is not a row that can be issued by hand".** The state list alone was not enough: `pendente` contains rows returned from `enviando` by a `desconhecida` that may be nothing more than the vendor's indexing lag, and registering one of those by hand ends the row terminally while a Focus document is still in flight — at a *different* provider, where no vendor-side deduplication can reach. `last_attempt_at IS NULL` says the current ref was never handed to the vendor; `status = 'erro'` says it was and the vendor refused, in a response we read. Those are the only two conditions under which a human can safely close a row by hand, and the clause is the whole of the fix.

**Zero rows is a refusal with a verbatim pt-BR message, and the reason this is a statement rather than a check is a duplicate nota.** With no transactions, "read the status, see `pendente`, write `manual`" is two statements with the hourly cron running between them. The scenario is ordinary: Rafael opens `/owner/notas`, sees `pendente`, clicks **Registrar nota emitida à mão**; the cron fires in the gap, moves the row to `enviando` and sends it. The manual write lands `status = 'manual'`, the row leaves the settle pass's selection **forever** — nothing will ever call `consultar(ref)` on it — and the automatic nota arrives anyway. Two notas, created by the feature written to prevent one. The `WHERE` clause is what makes that impossible, and the test for it is two simultaneous calls, not a status check.

The refusal message covers every zero-row case honestly, including the row having already been issued or dispensed, because zero rows does not say which: `Não foi possível registrar: o estado desta nota mudou (o envio automático pode ter começado). Atualize a fila e consulte o emissor antes de tentar de novo.`

**The sent-but-unconfirmed row is refused differently, and it has to be, because nothing changed and Rafael can see that nothing changed.** The action is not offered on such a row at all — it is hidden, with the reason printed inline where the button would be, so the refusal arrives before the trip to the emissor rather than after it. If it is nonetheless submitted (a stale page), the same `WHERE` returns zero rows and the message is the specific one: `Esta nota já foi enviada ao emissor e ele ainda não confirmou o que aconteceu. Não registre à mão agora — pode já existir um documento em nome da igreja. Use Consultar no emissor; se o emissor estiver fora do ar, confira na prefeitura antes de emitir.`

**Orphans: un-issued rows whose church was deleted, and the Dispensar action that ends them.** `nota_fiscal.church_id` nulls on deletion while `church_fiscal` cascades, so a `pendente`, `bloqueada` or `erro` row at deletion time survives with no church, no fiscal identity, no XML and no reachable terminal state. The issue pass can only move it to `bloqueada` (`dados_incompletos`) forever, the release-on-save statement is keyed on `church_id` and no save will ever come, and it sits in the queue showing an overdue deadline that nothing can clear — the exact "permanently red row" that teaches Rafael to stop reading the queue.

Cascading these rows away is the wrong fix: an `enviando` or `processando` row may correspond to a document that exists, and deleting it destroys the only record of one. Those two need no special handling anyway — the settle pass identifies rows by `provider_ref`, not by church, so an orphan settles normally into `emitida` (kept, correctly, as the legal record) or `erro` (which then becomes dispensable). So the fix is one action and one reason code: **Dispensar**, writing `dispensada` in the same conditional shape as every other write here, offered on rows with `status IN ('pendente','bloqueada','erro')` **and** `(status = 'erro' OR last_attempt_at IS NULL)` — the same sent-but-unconfirmed guard manual registration carries, and for the same reason: an orphan row can have been sent, and dispensing one terminally would lose the document instead of recording its absence.

**It is offered for two reasons, not one, and the second is `moeda_invalida`.** A non-BRL invoice is blocked at claim time and can never be released: the release-on-save statement filters `erro_codigo = 'dados_incompletos'` deliberately, because saving a CNPJ does not make a USD charge billable in reais. That left the row permanently red in the queue with no terminal action available to anyone — **the exact "trains Rafael to ignore the queue" failure this document names twice and had fixed for orphans only.** So the offer condition is `church_id IS NULL` **or** `erro_codigo = 'moeda_invalida'`, with the reason code carried through to the `dispensada` row so the two cases stay distinguishable afterwards.

**What Dispensar does not claim.** It records that no nota was issued and why. It does **not** decide whether one is still owed — for a payment a departed church made, or for a charge that arrived in the wrong currency. Both are fiscal questions, both are on the accountant's list, and a `dispensada` row is exactly the visible artifact that lets the answer be applied later instead of the row disappearing. That is what makes it a safe terminal action for a case nobody has adjudicated: it ends the *alert*, not the *question*.

**The heartbeat warning** sits at the top of the page and reads the `nota_run` row. Past three hours it warns. This is the detector for a dead scheduler, and it exists because an empty queue and a stopped cron are otherwise indistinguishable. **Beside it sits the stall banner, which renders `nota_run.last_result` whenever the last run named a reason it did no work** — `DESCRICAO_APROVADA` being `false` is one such reason; a missing vendor credential is the other. The issue pass doing nothing is survivable; a stalled queue that does not say so is not.

**That banner is the display path the "emissão não configurada" string never had, and its absence made the string decorative.** The failure-mode table says the route refuses with a named pt-BR error when `FOCUS_NFE_TOKEN` is unset **and writes no state** — so nothing set `last_result`, nothing rendered the sentence, and what Rafael actually saw was the generic three-hour heartbeat warning, which points at the scheduler for a problem that is a missing environment variable. **The correction keeps the guarantee and moves one statement:** the refusal writes the `nota_run` heartbeat, with `last_result` naming the reason, and **no `nota_fiscal` write of any kind** — which is what "writes no state" was protecting. It is not a new mechanism; it is pass 4's existing heartbeat statement, executed on the path that gives up early. It also has to be this way round rather than left to the heartbeat: the route *did* run, so `last_run_at` is fresh and the three-hour warning will never fire, which means without `last_result` the queue is stalled and reports itself healthy.

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
| **Our claim row lost (restore from backup), the lost row was on `attempt = 1`** | The ref is `nf-{stripe_invoice_id}-{attempt}`, so the replayed claim reconstructs **the same ref from Stripe alone** — the row is not needed. *If* one ref means one document forever at the vendor (unverified, homologação experiment), it refuses a second issuance under that ref, the adapter turns the refusal into a `consultar`, and the row lands on the document that already exists. This is the second idempotency layer earning its place; under the earlier client-side-uuid design it did not, because the ref died with the row. |
| **Our claim row lost (restore from backup), the lost row was on `attempt > 1`** | **Open, and stated as open.** The replay mints `attempt = 1` — the ref of a *rejected* submission — with fiscal data that has since been corrected. If a rejected ref is consumed at the vendor, the refusal is read and the walk converges. If it is not, and a rejected submission consumes no fiscal number, that `emitir` can succeed and produce **a second nota for one invoice with neither layer firing**: our unique index died with the row and the vendor holds no live document under that ref. This is the unverified property at the heart of the whole two-layer argument, and until it is answered a restore is a **manual reconciliation against the vendor's document list, not a resume of the cron.** |
| **Rafael registers a nota by hand while the cron sends the same row** | The `WHERE … status IN ('pendente','bloqueada','erro')` on the manual write returns zero rows and refuses in pt-BR. Without it: one manual row plus one automatic nota, and a row the settle pass would never look at again. |
| **Rafael registers a nota by hand on a row the vendor was already asked about** | The row is `pendente` because `consultar` said not-found, which is a read and not a proof — Focus may simply have been indexing. The action is **not offered**, and the write's `AND (status = 'erro' OR last_attempt_at IS NULL)` refuses it if submitted anyway. Without that clause: a document at the free emissor *and* a document at Focus, two providers, and a `manual` row the settle pass never queries again — the one failure with no compensating control anywhere in this design. Same guard on **Dispensar** for an orphan. |
| **A refund lands on a row sitting in `erro`** | Pass 2 ends it `dispensada` / `estornada`. Under the earlier action table it wrote only the watermark, leaving a row that **Tentar novamente** could still return to `pendente` — issuing a real fiscal document for refunded money, with the refund event already consumed so nothing would ever re-detect it. |
| **A refund lands on a `pendente` row that was already sent** (returned by a `desconhecida`) | Pass 2 **does nothing and writes no watermark**, exactly as it does for `enviando`. The issue pass re-sends the **same ref**: either the adapter's duplicate-ref rule lands the row on the document that already exists, or one is filed and the next pass cancels it. Under Revision 2's guard the row was written `dispensada` / `estornada` **and** watermarked — terminal, un-queried by the settle pass, un-backstopped by `emitida → cancelar`, un-re-detectable, and printing in pt-BR that no document was issued about a real one. |
| **A refund lands on a `bloqueada` row that was already sent** | Same deferral, and the issue pass cannot move it (it selects only `pendente`). **Consultar no emissor** is the ending: `emitida` → the document is recorded and the next pass cancels it; `rejeitada` → `erro`, from which the refund arm dispenses it. If the vendor never answers definitely, the row stays open and visible — see "Consultar no emissor". |
| **A partial refund lands on a row that is not `emitida`** | The partial path runs the same action table as a full refund with two substitutions, so the row ends `dispensada` / `estorno_parcial` — terminal, flagged, in the **Sinalizada** band, and never issued at the full value. Under the earlier wording the row kept its state, the watermark advanced, and the next issue pass filed a nota for the **full** `valor_centavos`; on a `bloqueada` row the flag also overwrote `dados_incompletos`, so the release-on-save statement matched nothing forever. |
| **Rafael clicks Consultar while the cron claims the same row** | The outcome write carries `AND status = $status_lido` and returns zero rows, refusing in pt-BR. Nothing is written. Without it the stale answer landed as `erro` on a row mid-flight, re-opening **Tentar novamente** (a second ref) and manual registration (a second provider). |
| **Consultar on a row whose story is over** | Not offered: the condition is `last_attempt_at IS NOT NULL AND status IN ('pendente','bloqueada','enviando','processando')`. Without the state list, a `manual` row registered out of `erro` could be written back to `erro` by a stale `rejeitada`, overwriting the hand-recorded `numero` and returning the row to the issuance path. |
| **`cancelar` returns a definite "no such ref"** | `desconhecida`: treated exactly as `indisponivel` — no terminal state, no watermark, `erro_codigo = 'cancelamento_pendente'`, **Sinalizada**, retried next pass. With three arms an adapter had to report it as `recusada`, which is terminal and tells Rafael in pt-BR that the prefeitura refused a document the vendor says it never held. |
| **`cancelar` times out** | `indisponivel`: no terminal state, no watermark, `erro_codigo = 'cancelamento_pendente'` so the row leaves the collapsed band for **Sinalizada**, and the next pass tries again. Under the earlier two-outcome reading a timeout was indistinguishable from a refusal and went straight to `cancelamento_falhou` — a loud, terminal alert about a cancellation that may have succeeded. |
| **Non-BRL invoice, and nothing can release it** | `bloqueada` / `moeda_invalida`, then ended by hand with **Dispensar**. The release-on-save statement deliberately does not touch it; before this revision nothing else did either, and it stayed red forever. |
| **A refund is handled and the run repeats an hour later** | The watermark on the nota row was written in the same statement as the decision, so the event is not re-selected. The two deferring arms (`enviando`, `processando`) write no watermark and are re-selected on purpose. |
| **Invoice paid and refunded inside one hourly window** | Pass 1 claims `pendente`, **pass 2 dispenses it**, pass 3 never sees it. No document is created and no municipal cancellation window is entered. Under the earlier pass order this produced an issued-then-cancelled nota minutes apart. |
| **A refund arrives mid-run, after pass 2** | The nota is issued and cancelled on the next run — the `emitida` → `cancelar` path, which exists for this. The residual window is one pass, and the guarantee is worded as "never issue against a refund we can see". |
| **`DESCRICAO_APROVADA` still false at deploy** | The issue pass does nothing, `/owner` carries a banner, `nota_run.last_result` names it, and rows accrue visible deadline pressure in `pendente`. **No fiscal document is ever filed carrying a placeholder.** |
| **Church deleted with un-issued notas** | `enviando`/`processando` rows settle normally — the settle pass keys on `provider_ref`, not on church. `pendente`/`bloqueada`/`erro` rows become orphans that no automatic path can drain, and Rafael ends each with **Dispensar** (`igreja_removida`). **One orphan cannot be ended immediately: one whose ref was already sent and answered not-found.** Dispensar is refused on it for the same reason manual registration is, and **Consultar no emissor** is what moves it — to `emitida`, or to `erro`, from which Dispensar is allowed. If the vendor never answers definitely, it stays open; see "Consultar no emissor". Whether a nota is still owed is the accountant's question, and the `dispensada` row is what keeps it askable. |
| **Municipality rejects after the vendor accepted** | `processando` → `erro` via the settle pass, with the prefeitura's message. |
| **Full refund, nota issued** | Cancellation attempted. Confirmed → `cancelada`. Refused → `cancelamento_falhou`, top of the queue, escalated copy. |
| **Full refund, nota not yet issued** | `dispensada`, reason `estornada`. No document is ever created. |
| **Full refund while `enviando`** | Nothing until the row settles; cancelled on the following pass. |
| **Partial refund, nota issued** | Recorded, flagged `estorno_parcial`, state unchanged, **Sinalizada**. A substituting nota is an accountant's call. |
| **Partial refund, nota not yet issued** | `dispensada`, reason `estorno_parcial`, flagged and visible in **Sinalizada**. No document is created at the full value, and whether one is owed at the reduced value is the accountant's question the row keeps askable. |
| **Dispute** | Recorded, no action. Deliberately unlike a refund. |
| **Cron never runs** | `nota_run.last_run_at` ages and `/owner` warns past three hours. This is the only detector, which is why the table exists. |
| **Cron runs, but the plan coarsens it to daily** | The heartbeat does **not** catch this — a daily run keeps `last_run_at` fresh enough often enough to look alive, and the three-hour warning would fire and clear in a pattern easy to dismiss. There is no code fix; it is a hosting-plan prerequisite, listed as one, and the number of retries before the deadline drops from ~120 to ~5. |
| **Vendor account suspended or vendor shuts down** | Every send returns `indisponivel`; rows accumulate in `enviando` and `pendente` and are visible. Rafael issues by hand at the free emissor — **the Emissor Nacional or his prefeitura's own, which one is a launch prerequisite to confirm** — and records each with **Registrar nota emitida à mão**. Already-issued XML is in our database, not at the vendor. **One subset is not free of risk and the queue says so:** a row already handed to the vendor under its current ref (`last_attempt_at` set, and not in `erro`) cannot be registered by hand, because the vendor may hold a document nobody can now ask about. For those, the check is outside this system — the document would be under Rafael's own CNPJ in his municipal records. This is not hypothetical — see Nuvem Fiscal. |
| **Zero-value invoice** | `dispensada`, reason `valor_zero`, visible as a row so the accountant's answer can change it later. |
| **Non-BRL invoice** | `bloqueada`. Never issue a nota for a number in the wrong unit. |
| **`invoice.paid` names a church billing has not matched** | No nota is claimed. Billing's repair queue binds it; the next hourly pass claims it with no replay machinery. |
| **Church deleted with issued notas** | `nota_fiscal.church_id` nulls; the rows and their XML survive, which is the point of the `SET NULL`. `church_fiscal` cascades away. Both asserted in the isolation suite. |
| **`FOCUS_NFE_TOKEN` unset** | The queue route refuses with a named pt-BR error, writes **no `nota_fiscal` state**, and writes the `nota_run` heartbeat with `last_result` naming the reason — which is what puts the sentence on screen as the stall banner. Rows stay `pendente`. Under the earlier "writes no state" the string had no display path at all: `last_result` was never set, `last_run_at` stayed fresh because the route *did* run, so the three-hour heartbeat warning never fired either and a queue stalled on a missing environment variable reported itself healthy. |
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
- `Dispensada: cobrança estornada parcialmente antes da emissão. Confirme com a contabilidade se uma nota de valor reduzido é devida.`
- `Recusada pelo emissor: {mensagem}`
- `Estorno parcial registrado. Uma nota substitutiva pode ser necessária — confirme com a contabilidade.`
- `Estorno registrado. A nota já foi enviada ao emissor e ele ainda não confirmou o que aconteceu — a fila continua verificando antes de decidir.`
- `Não foi possível aplicar a resposta do emissor: o estado desta nota mudou enquanto consultávamos. Atualize a fila e consulte de novo.`
- `Estorno registrado. O emissor ainda não confirmou o cancelamento — a fila continua tentando.`
- `Contestação registrada no Stripe. Nenhuma ação foi tomada nesta nota.`
- `⚠️ Enviada ao emissor há {n} hora(s) e ainda sem resposta.`
- `🚨 Pago há {n} dias e ainda sem nota fiscal. Confirme a competência e o prazo com a contabilidade.`
- `Emitir agora`
- `Consultar no emissor`
- `Tentar novamente`
- `Ao tentar novamente, uma nova referência é gerada no emissor. Use isto só depois de corrigir os dados fiscais.`
- `Registrar nota emitida à mão`
- `Número da nota`
- `Não foi possível registrar: o estado desta nota mudou (o envio automático pode ter começado). Atualize a fila e consulte o emissor antes de tentar de novo.`
- `Já enviada ao emissor — sem confirmação.`
- `Esta nota já foi enviada ao emissor e ele ainda não confirmou o que aconteceu. Não registre à mão agora — pode já existir um documento em nome da igreja. Use Consultar no emissor; se o emissor estiver fora do ar, confira na prefeitura antes de emitir.`
- `Não foi possível emitir agora: o estado desta nota mudou. Atualize a fila.`
- `A emissão está parada até a contabilidade aprovar a descrição do serviço. Nenhuma nota é emitida enquanto isso, nem por este botão.`
- `Igreja removida`
- `Dispensar`
- `Esta igreja foi removida. Nenhuma nota pode mais ser emitida para ela. Dispensar registra que o documento não foi emitido — confirme com a contabilidade se ele ainda é devido.`
- `Esta cobrança não está em reais e não pode ser liberada por dados fiscais. Dispensar registra que o documento não foi emitido — confirme com a contabilidade se ele ainda é devido.`
- `Dispensada: igreja removida.`
- `Dispensada: cobrança não está em reais.`
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
4. A **homologação** issuance completed end-to-end before any production token exists, verifying in particular: whether the IBS/CBS fields are required on NFS-e today; whether `consultar` returns not-found for a ref submitted seconds ago; what `emitir` returns for a ref that already has a document; whether a rejected ref can be reused; and what `cancelar` returns for a document already cancelled. Those five are the experiments the state machine's safety rests on. **The fourth decides whether restore-from-backup is a resume or a manual reconciliation, and the fifth decides whether a lost cancellation response can masquerade as a refusal.**
4b. **Which free emissor is Rafael's fallback** — the Emissor Nacional (gov.br) if his municipality adhered to the NFS-e Padrão Nacional, his prefeitura's own if not — **and a login proved to work there before launch.** This is the destination of every degraded path in this document: vendor outage, vendor shutdown, and every `manual` row. It cannot be discovered during the outage it exists for.
4c. **The `provider_ref` derivation pinned** — the derived `nf-{stripe_invoice_id}-{attempt}` form, or the sha256 fallback if the length or character-set check refuses it — **before the first production issuance.** Changing it later gives one invoice two reconstructible refs and silently removes the second idempotency layer from every row already issued.
5. `vercel.json` gains the hourly cron entry beside billing's daily one — **and the Vercel plan must be one that honours a sub-daily schedule.** Confirm the current limits before relying on the cadence; a plan that coarsens cron to roughly daily silently removes the retry budget the whole deadline argument is built on, and the heartbeat will not report it.
6. The **descrição do serviço approved by the accountant** and merged, flipping `DESCRICAO_APROVADA`. Until then the issue pass is stalled by design and no nota is issued for anyone.

## Testing

Everything runs on PGlite and pure functions. **Nothing ever touches the live vendor**, and the base URL is an env var precisely so that is enforceable.

- **`prazo.ts`, pure** — `competenciaFrom` across the São Paulo/UTC boundary in both directions (02:00 UTC on 1 Feb is January; 23:30 UTC on 31 Jan is January); `notaDeadline` for a 31-day month, a 28-day February and a December→January rollover; `notaUrgency` inside, on and past the boundary, matching the `church-status.test.ts` style. **Plus the advance-billing case the column alone did not cover: a competência one month in the future and a payment 90 days old escalates to the top level on age, not the bottom level on deadline.** That is the assertion that would have failed against the previous revision, which added the column and left the ordering untouched.
- **The claim statement, against PGlite** — this is the highest-value suite, because it is where the duplicate-prevention argument lives:
  - claiming the same `stripe_event` twice produces exactly one row;
  - two concurrent claims of the same invoice produce exactly one row;
  - a zero-value invoice lands `dispensada` and a non-BRL invoice lands `bloqueada`, each with its reason;
  - an `invoice.paid` row with `church_id IS NULL` claims nothing, and claims correctly on a later run **after** the event row is bound — the property that justifies consuming the ledger rather than the wire.
- **The `pendente → enviando` claim** — two simultaneous calls, exactly one returns a row; a call against a row already `enviando` returns none.
- **The state machine, with a stubbed provider** — one test per arm of `NotaOutcome` **in each pass that consumes it, which is what catches a missing arm**: `emitir` returning `desconhecida` writes nothing at all and leaves the row `enviando`, asserted column by column and asserted *distinctly* from the settle pass's `desconhecida`, which does move the row to `pendente`. Also: **`indisponivel` writes nothing at all**, column by column, and **no input whatsoever moves a row from `enviando` to `pendente` except `desconhecida` from the settle pass**. That last test is the guard on the sentence this design is built around; it should be written to fail loudly if anyone adds an age-based timeout.
- **`CancelOutcome`, all four arms** — `cancelada` → `cancelada` with the watermark; `recusada` → `cancelamento_falhou` with the watermark; **`indisponivel` → the row stays `emitida`, `erro_codigo = 'cancelamento_pendente'`, no watermark, and the next pass calls `cancelar` again**, asserted on the stub; **`desconhecida` → asserted column-for-column identical to `indisponivel`, and asserted *distinctly from* `recusada`** — the point of the arm is that a definite not-found never reaches `cancelamento_falhou`. A three-arm implementation passes every test that omits the fourth, which is exactly how the timeout became a refusal one revision ago.
- **`last_attempt_at` means what the guards read it as** — a row blocked for missing fiscal data has `last_attempt_at IS NULL` (the payload build runs before the claim); a row that reached the vendor has it set; a retry out of `erro` clears it in the same statement that mints `-2`. Three assertions, and the manual guard is meaningless without them.
- **The derived ref** — `provider_ref` is `nf-{stripe_invoice_id}-1` and contains no uuid; **claiming the same invoice after the `nota_fiscal` row has been deleted produces the identical `provider_ref`**, which is the whole restore-from-backup argument reduced to one assertion; and the adapter maps a duplicate-ref refusal to the result of `consultar`, never to `rejeitada` — asserted on the stub, because that mapping is what stops a retry minting a second document. **And one assertion that documents a gap rather than covering it:** deleting a row that had reached `attempt = 2` and re-claiming produces `nf-{invoice}-**1**`, not `-2`. That is the known hole from "The ref is derived from Stripe" written down as a test, so that nobody reading a green suite mistakes the `attempt = 1` case for coverage of the other one.
- **Retry from `erro`** — increments `attempt`, mints `nf-{stripe_invoice_id}-2`, returns to `pendente`, in one statement; and a retry from `emitida` or `enviando` is refused.
- **Release on save** — three `bloqueada` rows for one church, all released by one save, count returned by `RETURNING` matches the message; rows belonging to another church are untouched.
- **Refund handling** — issued nota cancelled; refused cancellation lands `cancelamento_falhou`; a refund against a **never-sent** `pendente` nota lands `dispensada` and **never calls `emitir`**, asserted on the stub; a refund against `enviando` calls nothing and leaves the row alone; a partial refund against an `emitida` row calls nothing and leaves it `emitida`; a refund against `cancelamento_falhou` calls **nothing at the vendor**, asserted on the stub.
- **Refund against a sent-but-unconfirmed row — the pair, because only the pair proves anything.** Drive a row `pendente → enviando → (settle: desconhecida) → pendente`, deliver `charge.refunded`, run pass 2: assert the row is **still `pendente`**, `estorno_tratado_ate` is **still null**, and no state column moved. Then assert the identical event against a never-sent `pendente` row **does** land `dispensada` / `estornada` with the watermark. The two rows differ only in `last_attempt_at`, and a test that seeds `pendente` directly proves nothing about either — which is how this arm shipped unguarded. Then run the next pass and assert the deferred row is re-selected rather than lost.
- **Full versus partial classification** — `amount_refunded == amount` takes the cancel path and `amount_refunded < amount` takes the flag path, asserted on the stubbed charge; and a charge the stub cannot return at all writes **nothing and no watermark** and is re-selected next pass, which is the assertion that stops an unclassifiable refund from defaulting to either arm.
- **Partial refund on a not-yet-issued row** — `pendente`, `bloqueada` and `erro` each land `dispensada` / `estorno_parcial`, `emitir` is called **zero** times afterwards, and the row appears in the **Sinalizada** band rather than the collapsed one. Plus the corruption assertion that names the second half of the bug: a `bloqueada` / `dados_incompletos` row that takes a partial refund is **terminal**, so a later save releases nothing — asserted as `dispensada`, *not* as a `bloqueada` row whose `erro_codigo` the release statement can no longer match.
- **Consultar no emissor** — offered only on `last_attempt_at IS NOT NULL AND status IN ('pendente','bloqueada','enviando','processando')`, asserted **not offered** on `manual`, `dispensada`, `cancelada` and `emitida` rows that carry a `last_attempt_at`; `emitida` from a `pendente` row lands the document, `rejeitada` from a `bloqueada` row lands `erro` (the orphan ending, and the assertion that fails against a settle-pass-guard reading); `desconhecida` and `indisponivel` write **nothing at all**, column by column, and specifically do **not** move an `enviando` row to `pendente` the way the settle pass does. **Plus the race, which is the whole point of the guard:** read the status, let the issue pass claim and send the row, then apply a `rejeitada` — assert zero rows, the verbatim pt-BR refusal, and that the row is untouched in `enviando`.
- **Refund against an `erro` row — the end-to-end sequence, not the single write.** Reject the nota so it lands `erro`; deliver `charge.refunded`; run the pass; then click **Tentar novamente** and run the issue pass. Assert `emitir` is called **zero** times and the row ends `dispensada` / `estornada`. Written as the whole sequence deliberately: asserting only "the refund pass writes `dispensada`" passes against the broken design too, because the broken design's defect was in what happened *afterwards*. This is the regression test for a real fiscal document issued against refunded money.
- **Every refund arm that consumes the event leaves a row from which no button can produce a document** — a table-driven test over the arms, asserting for each terminal arm that **Tentar novamente**, **Registrar nota emitida à mão** and **Emitir agora** all refuse by state. This is the shape-check, not the case-check: it fails when someone adds an arm that writes the watermark and leaves the row issuable.
- **And the second shape-check, which is the one Revision 2's re-audit did not have: no arm consumes the event on a row that may already have a document under its ref.** The same table, driven over `last_attempt_at` set and null for every state, asserting that **every write which advances `estorno_tratado_ate` is refused when `last_attempt_at` is set and the status is not `erro`.** The first shape-check asks *can a button issue from this row*; this one asks *may a document already exist under this ref*, and the two are not the same question — the whole of finding R3-2 lived in the gap between them. Written over the table rather than over a case so that a new arm cannot be added without answering both.
- **Pass order** — an invoice whose `invoice.paid` and `charge.refunded` events are both present at the start of one run ends `dispensada` with **zero calls to `emitir`**. This is the test that would have failed under the previous claim → issue → settle order, and it is the one that proves the reorder rather than describing it.
- **The refund watermark** — running the refund pass twice over the same event produces one state change and one flag; a `manual` row is flagged once and **not** re-flagged on the second run; a second, later refund event on the same nota **is** selected and acted on; two refund events sharing a `received_at` are both processed, which is the assertion that guards the `id` tie-break — without it the second is silently lost, and a lost refund reports nothing at all.
- **Manual registration** — allowed from `pendente`/`bloqueada`/`erro`, refused from `enviando`/`processando`/`emitida`/`manual`, and the refusal message is the verbatim pt-BR string. **Plus the sent-but-unconfirmed shape, which is the duplicate this revision closed:** a row driven `pendente → enviando → (settle: desconhecida) → pendente` is **refused**, with the specific pt-BR string, while a never-sent `pendente` row with the same status is **allowed** — the two differ only in `last_attempt_at`, and a test that seeds `pendente` directly proves nothing about either. Same pair for **Dispensar** on an orphan. And the row is not stranded: **Consultar no emissor** on that same row returning `emitida` lands it `emitida`, and returning `rejeitada` lands it `erro`, from which registration is allowed again — including for a row that has since been blocked, which is the orphan case and the one that would otherwise have no ending at all. **Plus the concurrency shape:** two simultaneous calls against one `pendente` row — exactly one returns a row; and a manual write racing the `pendente → enviando` claim — exactly one of the two lands, never both. A behavioural-only test passes against read-check-then-write code and proves nothing about the duplicate this guard exists to stop.
- **Refund → `dispensada`, concurrency** — two simultaneous refund passes over one `pendente` row produce one `dispensada` and one no-op; a refund racing the issue pass's `pendente → enviando` claim leaves exactly one winner, and when the claim wins the watermark is **not** written, so the next pass re-evaluates.
- **The descrição gate** — with `DESCRICAO_APROVADA` false, the issue pass selects nothing and calls `emitir` zero times, `nota_run.last_result` names the reason, and every row stays `pendente`; flipping the constant drains them on the next pass with no release statement and no migration.
- **Orphans** — deleting a church leaves a `pendente` row with a null `church_id` that the issue pass cannot drain; **Dispensar** ends it as `dispensada`/`igreja_removida` and is refused for a row whose `church_id` is not null and whose `erro_codigo` is not `moeda_invalida`; an `enviando` orphan still settles through `consultar(ref)`, proving the settle pass keys on the ref and not on the church.
- **`moeda_invalida` has a terminal action** — a non-BRL claim lands `bloqueada`; saving fiscal data does **not** release it; **Dispensar** ends it as `dispensada`/`moeda_invalida`. The middle assertion is the one that matters: it is the deliberate non-release that used to leave the row red forever.
- **Emitir agora** — refuses a row that is not `pendente`, with the verbatim pt-BR string; **refuses while `DESCRICAO_APROVADA` is false and calls `emitir` zero times**, which is the assertion that stops the button becoming a hand-operated way around the gate; and, racing the hourly pass over one row, exactly one of the two sends.
- **Queue bands** — every **row** maps to exactly one band, asserted over the full enum **crossed with orphan (`church_id IS NULL`) and flagged (`erro_codigo` in the Sinalizada set)**, so a new state cannot be added without a home and no row can be in two: specifically `processando` and a fresh `enviando` appear in band 6 rather than nowhere, `dispensada` appears in the collapsed band rather than being dropped, a flagged `emitida` row appears in band 4 and **not also** in band 8, and an orphaned `erro` row appears in band 2 and **not also** in band 3. The over-the-enum-alone version of this assertion cannot be written — bands 3 and 4 do not key on status — and writing it that way is what let two rows sit in two bands with the precedence undefined. Plus: within bands 5 and 7 the rows come back ordered by `notaUrgency`, so a three-month-old blocked row with a future competência sorts **above** a fresh one with a nearer deadline.
- **Queue ordering and progress** — seed more rows than the cap; assert the oldest-attempt page is processed and every one advanced; run again and assert the second page moves and the first is not revisited; make one row's provider call throw every time and assert it neither blocks its page nor sits at the head of the next run. Billing's suite, applied to this cursor.
- **Heartbeat** — a run with zero eligible rows still writes `nota_run`, which is the whole point of it. **And the credential path: with `FOCUS_NFE_TOKEN` unset the route writes `nota_run.last_result` naming the reason and no `nota_fiscal` row changes at all**, asserted column by column, with the banner rendering that string. The assertion that matters is the negative one — a stalled run must not be indistinguishable from a healthy one, and here `last_run_at` is fresh precisely because the route ran.
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
- **Whether a nota is owed for a charge that arrived in a currency other than BRL**, and in what value if so. `moeda_invalida` rows are ended by hand as `dispensada`, which records the non-issuance without answering this.
- **The municipal issuance rules quoted in "Decisions taken" and "Cancellation and refund" — SP's RPS→NFS-e conversion window and by-the-5th rule, RJ's by-the-5th rule and the Decreto 46.799/2019 number, and the "10 days subject to the ISSQN due date" substitution window.** All are secondary-source readings; none was checked at source; and an RPS→NFS-e *conversion* deadline is not an issuance deadline for a direct NFS-e, so the SP figure supports the placeholder rule less than its precision implies. They are used only for the shape of the claim — days, not weeks — never for a number in code.
- **Whether the congregation using the bot is the same legal entity as the CNPJ on the nota.** Congregações and filiais under a convenção's CNPJ are common. `church_fiscal.church_id` is unique today on the explicit assumption that this is 1:1, and the escape route is written into the schema section.
- Whether Rafael already has a CNPJ, an **inscrição municipal** and an **e-CNPJ A1**. Nothing in this repository indicates it, the inscrição can require an alvará first, and all three are ahead of any code on the critical path.

**Rollout and vendor — one call or one e-mail each:**

- **The status of the NFS-e Padrão Nacional as of August 2026.** Sources conflict irreconcilably: LC 214/2025 plus CNM messaging ties municipal adhesion to federal transfers from January 2026, while the official gov.br FAQ describes national adoption as optional provided the municipality mirrors data to the ADN. Both framings may be true at once. **Rafael's operative question is narrower and answerable: is his own city on the national standard today, or on its own system?** **That answer also names his manual fallback**, which three load-bearing statements in this document previously assumed was the Emissor Nacional: the `manual` state's escape hatch, the vendor-risk argument that eliminated Nuvem Fiscal, and the `FOCUS_NFE_TOKEN`-unset and vendor-shutdown failure rows. The design is indifferent between the two emissores; Rafael's disaster recovery is not, which is why confirming it is a launch prerequisite rather than a line on this list alone.
- **Whether IBS/CBS fields are mandatory on NFS-e right now, and the date NT 007 became operative.** The note formalised the group; a vendor page gives `09/02/2026` for both environments, **which is a vendor-page reading, unconfirmed at source, and ambiguous between 9 February and 2 September under `dd/mm` versus `mm/dd`** — the earlier draft asserted it as a date in the provider section and flagged only the mandatory-ness here. The note also says full use of the fields "depende do avanço do cronograma", while at least one vendor's marketing claims mandatory destaque from 01/01/2026. **Verify against a live homologação issuance, not against an article.**
- Whether Rafael's municipality is integrated by Focus NFe today, and the real cost and lead time if not.
- **The exact Focus NFe field names for NFS-e Nacional.** The reference page could not be retrieved while writing this; `payload.ts` is written against a schema nobody here has read, and it is deliberately the thinnest module in the subsystem for that reason. **One concrete consequence, which the earlier draft asserted instead of listing: what a missing `inscricao_municipal` should send.** That draft instructed the code to send the literal string "não informado" — a fiscal-field instruction with no schema behind it, and a likely rejection. Omitting the field, or marking the tomador não-contribuinte, are the candidates; the layout decides, not this document. The design rule that survives either answer is that a missing IM must never make `payload.ts` refuse.
- **That a `ref` at Focus NFe means "one ref, one document, forever"**, and that a *rejected* ref cannot be reused. The two-layer idempotency argument and the attempt-increment design both rest on this. One homologação experiment answers it. **The second half is sharper than the first and the earlier draft asserted it in place while listing it here:** a rejected submission normally consumes no fiscal number, so if a rejected ref *can* be reused, a restore-from-backup of a row that had reached `attempt > 1` can issue a second nota for one invoice with neither idempotency layer firing. Until it is answered, a restore is a manual reconciliation against the vendor's document list rather than a resume of the cron, and that is written into the failure-mode table as an open case rather than a handled one.
- **What `cancelar` returns for a document that is already cancelled, and whether it is distinguishable from a refusal.** The adapter is required to map it to `cancelada`; without that, a `cancelar` whose success we failed to read is re-attempted next pass and its success is recorded as `cancelamento_falhou` — a loud terminal alert, in pt-BR, about a problem that does not exist. Same experiment session as the `emitir` questions.
- **Whether `consultar` returns not-found for a ref submitted seconds ago.** This is the question the design actually rests on and the earlier draft never asked. If Focus reports an in-flight ref as not-found, `desconhecida` is not proof that nothing was created, and the `enviando → pendente` edge — the only edge out of the crash state — is unsound on its own. The derived ref absorbs a wrong answer (the re-send carries the same ref and the vendor deduplicates it), but that absorption is itself unverified, so **this and the ref question must be answered together, in the same homologação session, before the settle pass is trusted.**
- **What `emitir` returns for a ref that already has a document, and whether it is distinguishable from a rejection.** The adapter is required to map it to a `consultar`; if Focus does not distinguish the two, that requirement cannot be implemented as written and the retry-from-`erro` path needs rethinking before launch, not after.
- **The maximum length and permitted character set of a Focus `ref`.** `nf-` plus a Stripe `in_…` is roughly 32 characters of `[A-Za-z0-9_-]`. If that is refused, the fallback is `nf-{first 16 hex of sha256(stripe_invoice_id)}-{attempt}`, which is still reconstructible from Stripe alone. Truncating the invoice id is not an acceptable fallback.
- All quoted prices. Focus NFe's were read from `focusnfe.com.br/precos` on 2026-08-07 and Spedy's from its own pages the same day; both may be stale by the time anyone acts on them.

**Stripe — one live call each, and note these compound with billing's own unverified list:**

- Whether **`invoice.paid`** is the right event, or `invoice.payment_succeeded`, and whether it fires for a trial conversion and for a zero-value invoice.
- Whether the invoice's service period lives on the invoice or on the line item — the same uncertainty billing already records about `current_period_end`, and here it decides the **competência**, which is not cosmetic.
- Whether `amount_paid` is the right field against a partially-credited invoice.
- **How a full refund is distinguished from a partial one on a `charge.refunded` event.** The design uses `charge.amount_refunded >= charge.amount` off the `charges.retrieve` the refund pass already makes, and that comparison decides cancel-versus-flag for every arm of the action table — the highest-consequence unverified Stripe field in this document, because it ends in a municipal cancellation window. Two sub-questions ride with it: whether `charge.amount` is the right denominator when the invoice was partially credited (the `amount_paid` question above, arriving a second time on a costlier decision), and whether a sequence of partial refunds that eventually sums to the whole emits a final `charge.refunded` whose `amount_refunded` equals `amount`. **Until both are answered, a refund the pass cannot classify is not guessed at**: it writes nothing and no watermark and is re-selected next pass.

**Infrastructure:** nothing in this repository has executed against Neon, Vercel Cron has never run, and `NOTA_BATCH` and `NOTA_SETTLE_DELAY` against `maxDuration` need a measured Focus NFe round-trip from a deployed function. The numbers here — batch size, 5 minutes for the settle delay, and 30 days for `NOTA_IDADE_ALERTA` — are a starting point to be measured, not a result. The third is not a vendor measurement at all: it is a judgement about when an unissued nota stops being normal, and it belongs with the competência convention on the accountant's list.

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
8. **The `provider_ref` derivation, pinned before the first production issuance** — the derived form or the sha256 fallback. It looks like a developer's detail and is not: changing it after any nota exists gives one invoice two reconstructible refs, which deletes the second idempotency layer for every row already issued and cannot be repaired afterwards from Stripe.
9. **Which free emissor is the fallback**, and a login proved to work there before launch. Every degraded path in this document ends there.
10. **The Vercel plan.** Hourly cron is a paid capability, and the retry budget behind every deadline argument in this document depends on getting it. If the answer is no, the cadence is daily and the **Processar fila agora** button becomes part of Rafael's routine rather than a diagnostic.

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

### Revision 2 — two independent verification lenses, 2026-08-07

Both lenses returned **"Still blocked"**: one asking only *can this ever issue two notas for one payment*, one asking only *is this safe for Rafael to act on*. Between them they found four blocking defects, and **two of the four were introduced by Revision 1 while it was closing a finding** — which is why this revision's discipline is not "close the list" but "close the list without repeating the pattern".

**The pattern, named once, because it is now three-for-three on this project.** A fix that shrinks a defect while removing the thing that would have made it visible. Revision 1 closed the hourly-re-flagging finding by adding a refund watermark — and the watermark removed the hourly re-detection that was the only thing standing between a refunded `erro` row and a real fiscal document. Revision 1 closed the advance-billing blind spot by adding an **age since payment** column — and left the queue sorted by deadline, so the column was printed and never read. **A detector deleted in the course of shrinking a defect is a worse outcome than the defect**, and the test for it is a single question asked after each fix: *if this failure happened anyway, would Rafael see it?*

| # | Lens · Finding | What changed, and why |
|---|---|---|
| **H-C1** | honesty · A refund lands on `erro`, is consumed by the watermark, and **Tentar novamente** later issues a real nota for returned money | **The `erro` arm moved out of "nothing to do" and into `dispensada` / `estornada`, with `pendente` and `bloqueada`.** `erro` was grouped with the terminal states on the true premise that no document exists — but `erro` is the one state with a button on it that leads back to issuance, so consuming the refund there armed the exact document the guarantee at the top of that section forbids. Closing it needed no new state and no new column: a terminal state the row already had takes the retry button and manual registration out of reach by state alone. **The whole action table was then re-audited against the rule the defect taught — an arm may consume the refund event only if the row it leaves cannot become a document** — and the remaining arms hold. |
| **D-C1** | duplicates · A row returned from `enviando` to `pendente` by `desconhecida` is manually registrable, so Rafael can issue at the free emissor while Focus's document lands | **One clause on two writes: `AND (status = 'erro' OR last_attempt_at IS NULL)`.** The reviewer's observation is what made it cheap — `last_attempt_at` is already written before the vendor call, so a sent row is already distinguishable and no new state was needed. Two existing writes were corrected so the predicate is exactly true rather than roughly true: the issue pass now **builds the payload before claiming the row** (so a row blocked for missing fiscal data never acquires a `last_attempt_at` it did not earn), and the retry out of `erro` **clears** it (the new ref has never been sent). Same guard on **Dispensar** for an orphan. **One thing the guard needed and the spec had never supplied: a definition of `Consultar no emissor`**, which was listed as an action with no semantics. It is `consultar(ref)` on demand, on any row with a sent ref, applying the settle pass's own conditional writes — the escape hatch the refusal depends on, and the reason a blocked orphan that was once sent still has an ending. Revision 1's blanket defence — "a wrong `desconhecida` costs one wasted call, not a duplicate document" — is qualified in place: it is a *vendor-side* defence, and the manual path never touches the vendor. |
| **D-C2** | duplicates · Restore-from-backup where the lost row had `attempt > 1`; the spec asserted "the vendor refuses it" at one line and listed that exact claim as unverified at another | **The assertion is retracted and the open question is what stands.** A rejected submission normally consumes no fiscal number, so if a rejected ref can be reused, the replayed `attempt = 1` can succeed with the since-corrected data — a second nota with neither layer firing. Now stated in the ref section, in "What 'done' means", as its own failure-mode row, and as a test that asserts the reconstructed ref is `-1` *so a green suite cannot be mistaken for coverage*. Until the experiment answers it, **a restore is a manual reconciliation against the vendor's document list, not a resume of the cron.** |
| **H-C2** | honesty · The Emissor Nacional fallback asserted as fact in three load-bearing places against the spec's own UNKNOWN | Reclassified in all three. The fallback is "the free emissor — the Emissor Nacional if his municipality is on the Padrão Nacional, his prefeitura's own if not, **and which one is unverified**". The design is indifferent between them; Rafael's disaster recovery is not, so confirming it — with a login proved to work — is now a launch prerequisite and an owner decision rather than an assumption he would test during an outage. |
| **D-I3** | duplicates · `desconhecida` from `emitir` had no arm | Added, as `indisponivel` is handled: **no write at all**, the row stays `enviando`. It matters because the adapter's duplicate-ref rule forces `emitir` to return `consultar(ref)`'s answer at **zero delay**, against the very indexing lag `NOTA_SETTLE_DELAY` exists for — the least trustworthy not-found this system can produce. The available precedent would have mapped it to `pendente` and re-sent a just-sent row. Tested per pass, not per arm, which is what catches a missing arm. |
| **D-I4** | duplicates · `CancelOutcome` declared, never defined | Defined, three arms, the same discipline as `NotaOutcome` applied to the shorter clock: `cancelada` · `recusada` (**read**) · `indisponivel`. With two arms a timeout had nowhere to go but *refused*, which is terminal and tells Rafael the prefeitura refused a cancellation that may have succeeded. The `indisponivel` arm writes no watermark — **and it writes `erro_codigo = 'cancelamento_pendente'` so the row leaves the collapsed band for Sinalizada**, because a silent hourly retry on an `emitida` row is this revision's own pattern repeating. One adapter obligation added to match: already-cancelled must map to `cancelada`, never to `recusada`. |
| **D-I5** | duplicates · `Emitir agora` had no state guard | One row in the write table. It is pass 3 narrowed to one id, so it inherits the payload-build-then-claim order, the conditional claim, and — the part worth naming — the `DESCRICAO_APROVADA` gate, which a button that skipped it would turn into a hand-operated way to file the one document the gate exists to prevent. |
| **D-M6** | duplicates · `ON CONFLICT` names one of two unique indexes; ref derivation unpinned | Stated: a `provider_ref` collision is impossible under the derived form (the ref embeds the invoice id) and possible under the sha256 fallback, so the claim catches that unique violation and surfaces it in pt-BR rather than as a 500. And the derivation is **pinned before the first production issuance** — an owner decision and a prerequisite, because switching later gives one invoice two reconstructible refs and silently removes layer two for every row already issued. |
| **H-5** | honesty · `moeda_invalida` permanently red with no terminal action | **Dispensar** is offered on it as well as on orphans, reason `moeda_invalida`. The release-on-save filter deliberately still does not touch it — saving a CNPJ does not make a USD charge billable in reais — so the row needed an ending, not a release. Dispensar ends the *alert*, not the *question*: whether a nota is owed for a non-BRL charge is now on the accountant's list. |
| **H-6** | honesty · The advance-billing fix added a column but not a sort, so the alarm still never sounds | `notaUrgency` takes the payment date and returns **the higher of the deadline level and the age level**, and bands 5 and 7 sort on it. One function, one ladder, two inputs, one new named constant (`NOTA_IDADE_ALERTA`). **A column nobody sorts by is a decoration, not an alarm** — and the test that would have failed against Revision 1 is now written: a future competência with a 90-day-old payment escalates to the top level. |
| **H-8** | honesty · `processando` has no band, nor does a fresh `enviando` | They share band 6, at any age, carrying the same deadline and urgency copy every other un-issued row carries: **an un-issued row is an un-issued row regardless of who is holding it.** Band 8 is renamed for what it holds — decided — because "everything issued" was already false of `cancelada` and became false of `dispensada` the moment a refunded `erro` row started landing there. A test asserts every enum member maps to exactly one band. |
| **H-3, H-4, H-7** | honesty · Municipal citations, the NT 007 date, and the `inscricao_municipal` instruction asserted as fact | Reclassified, not defended. The SP/RJ rules and Decreto 46.799/2019 were secondary-source readings, and an RPS→NFS-e *conversion* deadline is not an issuance deadline for a direct NFS-e — a category error that made the placeholder look better-derived than it is. `09/02/2026` is a vendor-page reading, unconfirmed and ambiguous between February and September. "Send `não informado`" was a fiscal-field instruction written against a schema nobody here has read, and a literal in an IM field is a likely rejection; the design rule that survives is only that a missing IM must never make `payload.ts` refuse. |
| **H-9, H-10, H-11** | honesty · minor factual corrections | `church` is **21** columns, not 20 (`src/db/schema.ts:11-49`, `id` … `created_at`, counted). Cross-spec cites re-verified at source: billing's indexes are at `:109` (was `:113`), its `vercel.json` item at `:620` (was `:618`). And a payment with missing fiscal data is claimed **`pendente`** and blocked by the issue pass an hour later — the earlier text said it was claimed in `bloqueada`, contradicting its own claim SQL, and the correction now carries weight it did not before: it is *why* such a row stays registrable by hand. |

**What this revision did not do.** No new table, no new state, no new provider verb, no new column. The four blocking findings closed with **one `WHERE` clause, one arm moved between rows of a table, one type definition, and one retraction**; the eight others with a sort key, a band, an offer condition, a table row and a set of reclassifications. Two writes were *reordered or narrowed* rather than added — the payload build moving in front of the claim, and the retry clearing a column it already owned — and both were changes that made an existing column's documented meaning literally true instead of approximately true.

**Every fix was then re-asked the visibility question**, and three answers changed because of it. The refused manual registration prints its reason inline where the button would be, so the refusal arrives before the trip to the emissor rather than after it. The `cancelar` timeout raises a flag so its silent retry is not silent. And the refunded-`erro` row lands in a band that is now honestly named, rather than in one labelled "everything issued". The one case that could not be made visible from inside the system — a possibly-issued ref at a vendor that no longer answers — is written down as what it is, with the only check that actually exists: Rafael's own municipal records, under his own CNPJ.

### Revision 3 — propagation, 2026-08-07

Two independent verification lenses re-ran and **converged on one root cause with one fix**, which is the strongest signal either has produced. Revision 2 introduced a population as a named concept — **a row that has been sent at least once and whose outcome is unconfirmed**, identified by `last_attempt_at IS NOT NULL` — and guarded the two writes a *human* reaches. It did not carry the predicate to the three other places the same population can be reached. Each ended in two notas for one payment, or in a document the ledger denies exists.

**The failure mode of the last revision is worth naming precisely, because it is not the one this project keeps warning itself about.** Revision 2's discipline was *a fix must not shrink a defect while hiding it*, and by that test its fixes hold. What it did instead was **introduce a predicate and enforce it by hand, path by path**, rather than as an invariant every write answers. The re-audit it ran over the refund table used the older question — *can a button issue a document from this row?* — and never re-ran the table against the question it had just invented one section earlier: *may a document already exist under this ref?* A predicate enforced only where someone remembered it is a habit, not an invariant, and the third and fifth places it was needed were reached by machines rather than by Rafael, which is why nobody remembered.

| # | Lens · Finding | What changed, and why |
|---|---|---|
| **R3-1** | both · `Consultar no emissor` — the escape hatch every refusal points at — has no write guard, and both readings of it are broken | **A stated guard and a row in the write table.** The prose said `consultar` "is a read and may be called any number of times, which is why it needs no state guard of its own" — true of the call, false of the three writes that follow it, and the hourly pass runs in the round-trip between them. Reusing the settle pass's guards would have made the action **inert** on the `pendente`/`bloqueada` rows it exists to rescue (and the specified test unpassable); leaving it unguarded let a stale `rejeitada` land as `erro` on a row mid-flight, re-opening **Tentar novamente** (a second ref) and **Registrar à mão** (a second provider). The write now carries `AND status = $status_lido` — the status the request itself observed — with `RETURNING`, and zero rows refuses in pt-BR. **The offer condition was also wrong** and is now `last_attempt_at IS NOT NULL AND status IN ('pendente','bloqueada','enviando','processando')`: previously it appeared on `manual`, `dispensada` and `cancelada` rows, where a stale `rejeitada` would overwrite a hand-recorded `numero` and resurrect the row into the issuance path. |
| **R3-2** | both · The refund → `dispensada`/`estornada` arm never got the clause the human writes got | **The same clause, on the write a machine reaches:** `AND (status = 'erro' OR last_attempt_at IS NULL)`. A row returned to `pendente` by a `desconhecida` is the sent-but-unconfirmed population wearing a different label — the state table says so — and the arm wrote a terminal state **and the watermark**, after which the settle pass never asks about the ref again, the `emitida → cancelar` backstop cannot fire, nothing re-detects the event, and the row prints in pt-BR that no document was issued about a real one. Zero rows now **defers**, exactly as `enviando` does. **The deferred row is not stranded and the cost is stated rather than hidden:** the issue pass re-sends it under the same ref and it reaches `emitida` or `erro` within a pass, which means in the case where the not-found was true a nota is filed against a visible refund and cancelled an hour later. That is the trade, taken deliberately — a document cancelled inside the window, against a terminal row that lies forever. |
| **R3-3** | honesty · The partial-refund arm was written for `emitida` only, and `charge.refunded` lands on four other states | **The partial path is the same action table with two substitutions** — the `emitida` arm flags instead of calling `cancelar`, and every arm that writes `dispensada` writes reason `estorno_parcial` instead of `estornada` — so it inherits the guards, the deferrals and the watermark rule rather than restating them. Under the old wording a partial refund on a not-yet-issued row advanced the watermark, left the row issuable, and the next pass filed a nota at the **full** amount. On a `bloqueada` row it was quieter and worse: `erro_codigo = 'estorno_parcial'` overwrote `dados_incompletos`, which is the exact value the release-on-save statement filters on, so saving the CNPJ released nothing forever and Dispensar was not offered either. Both close by the row reaching a terminal state instead of a corrupted flag. |
| **R3-4** | honesty · Nothing said how a full refund is told from a partial one | Named: **`charge.amount_refunded >= charge.amount`**, off the `charges.retrieve` the pass already makes. No new call, no new column. Two sub-questions go on the unverifiable list beside the existing `amount_paid` one — the right denominator against a partially-credited invoice, and whether a sequence of partials that sums to the whole emits a final event — and **a refund the pass cannot classify is not guessed at**: no write, no watermark, re-selected next pass. |
| **R3-5** | duplicates · `CancelOutcome` had no `desconhecida` arm | Added, as the fourth arm. With three, an adapter reading a definite *no such ref* had nowhere to put it but `recusada`, which is terminal `cancelamento_falhou` and prints that the prefeitura refused a document the vendor says it never held. Its **write is identical to `indisponivel`'s** — no terminal state, no watermark, `cancelamento_pendente`, Sinalizada, retried — because operationally both mean *we have no confirmation*; the arm exists so the adapter is never forced to launder a definite answer into a refusal, which is the argument that produced `indisponivel` in the first place. |
| **R3-6** | honesty · "Every status maps to exactly one band" is false, and the specified test cannot be written | Bands 3 and 4 key on `church_id` and `erro_codigo`, not status, so a flagged `emitida` row was in two bands and precedence was undefined. **The bands are now evaluated in order, first match wins**, band 3's predicate excludes `erro` explicitly (an orphaned `erro` row belongs in band 2, where the copy is honest about what it needs), and the test asserts every **row** maps to one band — over the enum **crossed with** orphan and flagged. The old assertion was unwritable, which means it would have been quietly weakened into one that passes. |
| **R3-7** | honesty · `A emissão de notas não está configurada.` had no display path | The route's missing-credential refusal now writes the `nota_run` heartbeat with `last_result` naming the reason, and **no `nota_fiscal` write of any kind** — which is what "writes no state" was actually protecting. Not a new mechanism: pass 4's existing heartbeat statement, on the path that gives up early. It has to be this way round, because the route *did* run, so `last_run_at` is fresh, the three-hour warning never fires, and without `last_result` a queue stalled on a missing environment variable reports itself healthy. |

**What this revision did not do.** No new table, no new state, no new column, no new provider verb. The three blocking locations closed with **one `WHERE` clause used three times, one table row, one offer condition and one substitution rule**; the four others with one type arm, one comparison, one ordering sentence and one statement moved onto a path it already existed on. Nothing was added that a reader could mistake for machinery, which was the constraint: if the fix needed a mechanism, the diagnosis was wrong.

**Every fix was re-asked the visibility question, and two answers changed because of it.** The deferred refund could have been closed by making the issue pass skip a row with an unconsumed refund — smaller, and it would have left the row permanently `pendente` with a deadline nothing could clear and no explanation of why. It was rejected for that: the row now converges to `cancelada` or `cancelamento_falhou`, both true and both loud. And the partial refund on a never-issued row was nearly left as a flag on a `bloqueada` row, which is invisible in a band called *blocked*; it lands `dispensada` with its reason and shows in **Sinalizada**, where a decision waiting on Rafael belongs.

**Two things this revision deliberately did not close.** The restore-from-backup case at `attempt > 1` is still open and still a homologação experiment, still written as an unhandled failure-mode row and a test that documents the gap rather than covering it. And the case where Focus never answers definitely about a possibly-issued ref still leaves a permanently open row — closed only from outside the system, in Rafael's own municipal records under his own CNPJ. **Both remain stated rather than engineered away, because the machinery that would close them is exactly the machinery this revision refused to add.**
