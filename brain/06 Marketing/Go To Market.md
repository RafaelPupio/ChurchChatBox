# Go To Market

How a solo operator with no budget, no customers and no nota fiscal gets to the first ten churches.
Strategy is in English; every line a church will read is marked **pt-BR** and is quoted verbatim.
Every pt-BR line addresses the pastor as **o senhor** — with a 60-year-old pastor that is the safe
default, and [[Sales Kit]] uses the same register.

**The uncomfortable frame, first.** Three facts set the whole shape and none of them is a marketing
problem: the product cannot legally be sold to a church with a CNPJ until nota fiscal exists
([[Decisions Log]]); an outbound WhatsApp message has never succeeded once ([[Whats Left]]); and
**no church has ever used this** — zero customers, zero testimonials, zero usage numbers. So the
honest goal for the next months is **not revenue**. It is: a live bot, two or three pilot churches
that like it, a demo number another pastor can message, and a named waitlist. Selling starts when the
gate opens.

---

## 1 · Ten is the ceiling, not the ambition

Before choosing channels, size the target honestly against what's built. Per [[Whats Left]] there is
**no password reset and no way to change your own password**, **no monitoring or alerting**, **no
notification of any kind**, **no onboarding flow** and **no offboarding**. There is also **no billing
of any kind**: Stripe is specced, not built, so today an invoice would be a manual act by Rafael.

Every church therefore costs Rafael, by hand: chip guidance, Meta number verification, credential
paste, content help, and a script run every time a volunteer forgets a password. Nothing tells him the
webhook died at 2am.

At that support cost, a realistic solo ceiling is roughly **five to eight churches** before support
eats the week. **Ten is the capacity limit of the current build, not a modest goal.** Passing it is a
product problem (password reset, alerting, self-serve onboarding, billing) before it is a sales problem.

---

## 2 · The ideal first church, and who to walk away from

The targeting constraint that matters most is not size or denomination — it is **the missing
notification**. The realistic failure is: a member taps *Falar com Atendente* at 21h on a Wednesday,
the bot goes silent for them, nobody opens the panel until Sunday, and the member's experience is
that the church ignored him. That is worse than having no bot. The 24h auto-revert ([[Bot Flow]]) caps
the damage and does not fix it — and note it is **built but never exercised** ([[Whats Left]]).

So, until notifications exist:

| Qualify **in** | Qualify **out** |
|---|---|
| **One named person who reliably opens the panel on weekdays** — ideally paid, ideally part-time, and named out loud in the first meeting | An all-volunteer WhatsApp answered from one phone, well, in five minutes |
| Enough volume that the same four questions repeat | Under ~80–100 members where the status quo is genuinely correct |
| An active Instagram sending strangers to the church | No inbound from outside the membership |
| CNPJ, a contador, **and a card on the CNPJ** | No card and no willingness to get one — park, don't argue |
| Autonomous local decision | Denominational HQ already standardised on inChurch — the door is closed |

**Computer or phone? Answered from the code, not assumed.** The earlier version of this table required
"a secretary already at a computer", which would discard most of the addressable Brazilian church.
That cut is not supportable. The panel is an ordinary web page and opens in any phone browser. But:
`src/app/layout.tsx` sets **no `<meta name="viewport">`** and `src/app/globals.css` contains **zero
`@media` queries** — the layout is a fixed `max-width: 880px` container. A phone browser will
therefore render it at its default desktop width and zoom out: usable, small, pinch-to-zoom. And
[[Whats Left]] lists mobile polish as *requested 2026-08-08, not started*, with the note that a
secretary answering from her phone **is** the real daily use. **Rafael must open the panel on a real
phone himself before this table is used to turn a church away** (§8 item 3). Until he has, the
in-criterion is about the person's habit, not her hardware.

**Disqualifying is a strategy, not a failure.** A small church where the sister answers in five minutes
is right to say "a gente já faz isso", and pushing past that produces a churn in month three inside the
exact network the referral engine depends on.

---

## 3 · Where the first ten actually come from

Ranked by realistic yield per hour, not by reach. Nothing here is advertising — there is no budget and
paid acquisition against this buyer is not a solo operator's game.

**1 · Church #0 — Rafael's own church. Free, forever.**
Not a customer: the proving ground, the demo, and the only source of true sentences he will have.
*Status, precisely:* the Neon database exists, the migrations are applied, and a church row was
provisioned and logged into ([[Whats Left]]) — i.e. stage 7 of [[Launch Roadmap]] has in fact happened,
even though that table still prints it as 🔜 (the table is stale; [[Whats Left]] is the source of truth
and wins). What has **not** happened: no real member has ever messaged it and no outbound message has
ever succeeded. "Church #0 is live" is not yet a true sentence. Its second job is to make the first
real member conversation happen somewhere the consequences are survivable.

**2 · The two or three churches Rafael or his pastor can call personally.**
This is the entire first tier and it is not scalable, which is fine — the first ten never are. A pastor
introducing a pastor is the only cold-start mechanism this market has.

**3 · The city's pastors' council / association.**
Denominational vocabulary to use: *reunião de obreiros* per setor/campo (AD), *convenção estadual*
(Batista), *presbitério* (Presbiteriana). Most cities also have a *Conselho* or *Ordem de Pastores*.
⚠️ **Unverified:** the cadence — "monthly, often as a breakfast" — is Rafael's impression, checked by
nobody. Confirm it for his own city before planning around it; the denominational names above are the
part to trust. **Do not present.** Go once as a guest of a pastor who already has the bot, be
introduced, show it on a phone at the table for two minutes, leave. A slot on the agenda reads as a
vendor; a phone across a coffee table reads as a brother showing something.

**4 · Pastors' WhatsApp groups — only through a member, never cold.**
Every association has one. Posting into it uninvited is the exact spam behaviour the product's whole
positioning refuses ([[Backlog]], "Broadcasts / avisos" under *Considered and parked*), and it burns the
group permanently. The move is to have a pilot pastor post it himself, in his words, with the demo
number. Rafael writing the message for him to paste is fine and normal; Rafael posting it is not.

**5 · Adjacent suppliers who already bill churches monthly.**
The highest-leverage partner is the **contador specialised in igrejas / terceiro setor** — he serves
dozens of churches, he is trusted on exactly the money question, and he is the same person who gates
the nota fiscal. Also: church sound/AV shops, gráficas that print boletins, and the small agencies that
run church Instagram accounts. These are the only relationships where a **paid referral commission** is
appropriate (it is normal B2B), and they require nota fiscal and a written agreement first — so they
are a phase-3 move, not a now move.

**6 · Expo Cristã and similar supplier fairs — walk them, don't exhibit.**
A stand costs money that does not exist and generates leads that need a follow-up motion Rafael doesn't
have. Attending is cheap reconnaissance: it is where the church-software vendors pitch in person and
where the pricing anchors get set. (An earlier draft cited [[Backlog]] here for competitor context —
that was a miscitation: `Backlog.md` contains no competitor material at all. The competitor list lives
in §8 item 5 and nowhere else in this repo.) Sourcing: `expocrista.com`, found by web search on
2026-08-08; the site spells it **Expo Cristã** and lists 2026 editions in São Paulo and Rio de Janeiro.
The pages themselves were not opened — **confirm city and dates before booking anything.**

**7 · Seminaries, Facebook groups, Instagram, cold WhatsApp to churches.**
Listed to be dismissed. Seminary students have no budget. Cold WhatsApp to a church's public number is
low-yield, risks Rafael's own number, and contradicts everything the product says about not being spam.

**The asset that does more than all of the above: a live number to message.**
There are no testimonials and no case studies, and inventing them is forbidden. The substitute is a
number a pastor can tap right now. Budget **one extra chip** for a permanent demo tenant — creating the
tenant itself is a form in the owner console (`src/app/owner/(protected)/NewChurchForm.tsx`), not a
deploy ([[Multi-Tenancy]]). Name it unmistakably fictitious (*Igreja Demonstração*) so it can never be
mistaken for a customer. Note: Meta's free test number only reaches a short list of pre-registered
recipients (confirm the current limit — [[Meta WhatsApp Setup]]), so an **open** demo needs a real chip
and a verified number, and **Meta business verification is currently a blocker** ([[Whats Left]]).

---

## 4 · Referral mechanics

Referral is the whole engine, so it has to be a mechanism and not a hope.

- **Ask for a name, never for "spread the word".** The ask is: *"O senhor conhece dois pastores que
  reclamam do WhatsApp da igreja? Me apresenta num grupo, eu falo com eles."*
- **Ask at the right moment**: after the church's first full month, holding a real number — messages
  answered, prayer requests received. Not at signup, when there is nothing to vouch for.
- **The referral is an introduction, not a lead.** A three-way WhatsApp intro converts; a forwarded
  contact does not.
- **Reward the church, never the pastor.** Free months credited to the referring church. Cash to an
  individual pastor for recommending inside his own association is reputationally corrosive in this
  market and is not worth the deal it wins. Paid commissions belong with suppliers (item 5 above).
- **Write down every introduction that did not convert, and why.** With ten data points the objection
  distribution is real instead of remembered.

---

## 5 · The first conversation

Twenty minutes, in person or by WhatsApp áudio. **No deck.** The goal of meeting one is *not* a sale —
it is to learn whether there is volume, who the actual user is, and whether the church can pay by card.

**Order matters, and the order is: confess the chip, then show, then say what it does not do, then
qualify them.** The chip goes *before* the demo, not after: discovered late it kills the deal, and
letting a pastor fall in love first and then handing him the catch is the move this product's whole
positioning refuses. [[Sales Kit]] opens the same way (*"Antes de eu mostrar…"*) — **these two assets
must stay in the same order; if one changes, change both.**

1. **Raise the chip before showing anything.** Non-negotiable.
   > **pt-BR ·** *"Antes de eu mostrar, uma coisa que costuma aparecer só no final: precisa de um chip
   > novo. O número que a igreja usa hoje continua funcionando exatamente como está — ninguém mexe nele.
   > Um número ligado à API oficial da Meta para de funcionar no aplicativo do WhatsApp para sempre, e o
   > histórico não vai junto. Por isso ninguém coloca o número principal da igreja nisso."*
2. **Now hand him the phone.** Send the demo number, let him tap the menu himself. Thirty seconds beats
   any description, and it makes the "sem download" difference obvious without a word.
3. **Say what it does not do, out loud, before he asks.** He is about to ask for broadcast, because that
   is what pastors want — and he needs the second half of this before he decides anything.
   > **pt-BR ·** *"Ele não manda aviso para a congregação. Só responde quem falou com ele primeiro. É
   > por isso que ele não tem custo por mensagem e é por isso que ele nunca vai parecer spam."*
   > **pt-BR ·** *"E ele não avisa ninguém da igreja quando alguém pede para falar com uma pessoa. A
   > conversa fica esperando no painel até alguém abrir. Hoje isso depende de vocês terem alguém que
   > abre o painel nos dias de semana. Estou construindo esse aviso; ainda não existe."*
4. **Then the three qualifying questions.** Listen; do not sell over the answers.
   > **pt-BR ·** *"Quantas mensagens chegam no WhatsApp da igreja numa semana normal?"*
   > **pt-BR ·** *"Quem responde hoje? Posso conversar 15 minutos com essa pessoa?"*
   > **pt-BR ·** *"A igreja tem CNPJ e contador? E cartão no CNPJ, ou só PIX e boleto?"*
5. **The nota fiscal status, honestly, before he asks.**
   > **pt-BR ·** *"Hoje eu ainda não emito nota fiscal — estou resolvendo isso. Então não vou fazer uma
   > proposta ao senhor agora. Quando estiver pronto eu aviso, e aí o contador de vocês tem tudo que
   > precisa."*
6. **Close on a specific next step, and it is the secretary.** *"Posso conversar com quem responde o
   WhatsApp de vocês?"* If the volunteer does not adopt, the subscription dies silently in month three
   and the pastor cancels without drama. She never signs anything and she decides everything.

**Four things never to say:** that another church already uses it; any usage number; that the system
"é compatível com a LGPD"; and anything about how billing behaves, because none of it is built (§7).
On the LGPD one, the refusal itself is the argument —
> **pt-BR ·** *"Eu não vou dizer ao senhor que o sistema 'é compatível com a LGPD' — isso é uma
> afirmação jurídica, e software nenhum garante isso. Digo o que ele faz: guarda o número do membro, as
> mensagens daquela conversa e o pedido de oração; tem um item de Privacidade no menu que explica isso
> ao membro; e a igreja é quem manda nesses dados, não eu."*

---

## 6 · Pricing structure (no number)

The number is not set and must not be invented here. The **structure** can be settled now, and it is
mostly a set of refusals.

**Flat monthly, per church. One price, one product.**

| Rejected model | Why |
|---|---|
| **Per member** | There is no member database and building one is an explicit non-goal ([[Overview]]) — we cannot count them without becoming a different product. It also punishes growth, which is the church's mission, and a pastor hears it as a price per soul. |
| **Per message / per conversation** | Member-initiated conversations are **free** on the Cloud API ([[Decisions Log]]). Per-message pricing invents a cost that does not exist and gives the church a reason to hope fewer people write. |
| **Per staff seat** | Extra seats are how a church gets a *second* person checking the inbox — the mitigation for the product's single worst operational risk. Charging for the fix to our own weakest link is backwards. |
| **Tiers** | A tier needs a feature to withhold, and there is one feature set. A "básico" without the inbox is a broken product that would fail in public. Tiers also multiply the support surface for one person and turn a yes/no into a decision. |
| **Mandatory setup fee** | A barrier at the moment trust is lowest, and the church is already buying a chip. Rafael's onboarding labour is real and should be recovered in the monthly price, not in a fee that makes the first invoice the biggest one. |

**What the structure buys, said plainly:**
> **pt-BR ·** *"É uma mensalidade fixa por igreja. Não cobro por mensagem, não cobro por membro, e o
> valor não aumenta quando a igreja cresce. Sem taxa de instalação."*

**The two boundaries the number has to live between:**

- **Ceiling — Igreja Digital.** Read from **`igreja.digital`** (homepage, seção *Planos*) on
  **2026-08-08**: ID Free R$ 0,00/mês · **ID Lite R$ 69,90/mês** · ID Plus R$ 99,90/mês · ID Max
  R$ 1.399,90 anual (annual only), with 3–16% off for longer commitments. ID Lite is an entire church
  management system. This product is one piece of one channel; pricing near that line makes it look
  like a whole product's price for a part. ⚠️ Two cautions: prices may be stale by the time anyone acts
  on them — **re-read the page before quoting it to anyone**; and the domain is `igreja.digital`, not
  `igrejadigital.com`, which is a parked domain for sale.
- **Floor** — fixed monthly costs arrive *before* the first church: **Focus NFe Solo R$ 89,90/mês**
  (read from `focusnfe.com.br/precos` on 2026-08-07, per `docs/superpowers/specs/2026-08-07-nota-fiscal.md`;
  same staleness caveat), plus Vercel and Neon moving off free tiers the moment there is commercial use
  ([[Hosting & Deploy]]), plus real support hours per non-technical church. The first two or three
  churches are cost recovery, not income. **Solve this arithmetic before the first proposal, not after.**

**Annual: offer it, don't push it.** Arguments for — some denominations approve an annual budget in
assembleia, where a single yearly line is *easier* to pass than a new recurring debit; it dodges the
January–February and July cash squeezes; and it means one nota a year instead of twelve. Argument
against, and it is specific: annual billing is **advance billing**, which is precisely the case the nota
fiscal spec flags as the blind spot — a future competência makes the deadline look comfortable while the
row ages. Don't lead with annual until the queue's age-based sorting has been proven in practice.

**Free trial — the sharp part.** A time-boxed trial that starts at signup is *wrong here*, because Meta
business verification takes days, the chip has to be bought, and the content has to be written. A
14-day trial can expire before the bot has ever answered a member. Two rules:

- **The subscription is not created until the church announces the number to its members.** Everything
  before that day — chip, Meta, credentials, content — is unpaid setup and Rafael eats it. That is the
  true cost of a sales-assisted product with a three-week onboarding, and it is a process rule that
  costs nothing to implement.
- **If a trial is needed to answer the objection, it is 30 days from go-live, with the card collected
  up front.** A church's rhythm is monthly — the calendar image, the cycle of events, a full month of
  Sundays. Two weeks does not contain enough Sundays to prove anything. Card-up-front is what the
  billing **spec** decided (`docs/superpowers/specs/2026-08-07-stripe-billing.md` — specced, not built),
  for the right reason: a trial that ends with no card produces a dark bot and a confused pastor after
  Rafael has spent days on Meta verification. Both bullets are process rules Rafael follows by hand —
  no code enforces either of them today.

---

## 7 · How the two blockers reshape the sales motion

### Nota fiscal is a gate, so the motion has to stop short of the treasurer

A church with a CNPJ and a contador generally cannot pay a recurring invoice without a nota
([[Decisions Log]]). That is not an objection to handle — it is a wall. The consequence for the sales
motion is counter-intuitive and strict:

**Until the nota exists: demo freely, qualify freely, and never quote.** No proposal, no price, no card
request, nothing that reaches the tesoureiro. A proposal that dies at the treasurer does not reset — it
spends the pastor's willingness to raise the subject with his board, and the *second* raise is harder
than the first. The correct artifact for this period is a **named waitlist**: pastors who saw the demo
and said *"me avisa quando estiver pronto"*, with dates.

### Card-only is a decision, not a working system — say it that way

⚠️ **This is where the source of truth overrides the critique.** [[Decisions Log]] records the
card-only decision *and* the 7-day grace / automatic suspension / automatic reactivation design, so
those lines are genuinely "supported by the Decisions Log". But [[Whats Left]] puts Stripe under
*specced, ready to plan, not built* — **there is no billing behaviour in the product at all.** A
decision that is written down is not a feature that runs. The earlier script here promised a pastor
seven days of grace and that "nada é apagado" when a charge fails; **nothing would have happened**,
because nothing charges. That line is cut. When Whats Left and any other document disagree about what
exists, Whats Left wins.

Many small churches have no card on the CNPJ. The honest framing concedes whose convenience this is —
> **pt-BR ·** *"A cobrança vai ser no cartão do CNPJ. Eu sei que igreja prefere PIX. O motivo é do meu
> lado, não do seu: o cartão é o que me deixa tocar isso sozinho, sem ficar conferindo pagamento um a
> um. Se isso for um impedimento para vocês, me diga — eu estou anotando quem não pode pagar assim."*

Note the future tense: until Stripe is built, there is nothing to charge with, and the first churches
are free pilots anyway.

Two hard rules:

- **Never propose the personal-card shortcut.** "Põe no meu cartão e a igreja me reembolsa" creates the
  exact problem the nota exists to solve — a document issued to the CNPJ while the money left a pessoa
  física — and puts the pastor somewhere he will resent.
- **Keep a counted list of every church lost to card-only, with dates.** [[Decisions Log]] already names
  the review trigger ("the first church that refuses"). A list turns that from a feeling into a number,
  and the day the number is embarrassing, PIX/boleto stops being a preference debate. Note what is
  actually at stake in a switch: the status model survives unchanged; what is lost is **automatic
  dunning** — i.e. Rafael's convenience, not the church's. Say that out loud when the time comes.

---

## 8 · The months before nota fiscal exists

Sequenced by what blocks what. Items 1 and 4 run in parallel; 4 is the long pole and most of it is not code.

1. **Make the first outbound message succeed.** Meta app + test number. Nothing in this document is real
   until this is ([[Launch Roadmap]] stage 8). **Meta business verification** is a live blocker
   ([[Whats Left]]) and should already be running in parallel.
2. **Close the two launch blockers a pilot hits on day one**: password reset, and *some* notification
   when a member is waiting — even an e-mail. [[Whats Left]] lists notification only as a wishlist item
   ("PWA — install to home screen, notify staff when a member is waiting"); for go-to-market it is a
   **blocker**, because a pilot that fails becomes an anti-reference inside the one network the referral
   engine runs on.
3. **Open the panel on a real phone and add a `<meta name="viewport">` tag.** Fifteen minutes, and it
   decides whether §2's qualification table is honest. Today `layout.tsx` has no viewport tag and
   `globals.css` has no media queries, so nobody actually knows what a secretary sees.
4. **Run church #0 live and free, then pilots #2 and #3 from personal relationships.** Give each a
   written one-pager: what they get (everything, free, for N months, Rafael's full attention), and what
   he asks back (find the bugs; if it works, two introductions). Write it down — an unwritten pilot
   becomes an unpaid customer with expectations.
5. **Do the nota fiscal prerequisites that are calendar time, not code**: CNPJ with a services CNAE,
   inscrição municipal, e-CNPJ A1 (confirm the accepted format with the vendor *before* buying),
   confirm Focus NFe covers Rafael's municipality (≈R$ 199 and ~15 days if it does not), and get the
   accountant's answers. Then the four homologação experiments. This is months, and it starts now.
6. **Do the competitor field trip.** ⚠️ **Sourcing note: the five names below were found by web search
   on 2026-08-08 and the URLs resolve, but the pages themselves were not read.** Treat every
   *description* as unverified and check it before repeating it to a pastor — being wrong in front of a
   pastor who already tried one of them is expensive; an afternoon is not.
   - **SecretáriaBot** — `secretariabot.com.br`. Appears to be a general AI secretary for WhatsApp, not
     church-specific. Unconfirmed.
   - **ProchatWeb** — `projecaoweb.com.br/prochatweb-chatbot-de-atendimento-multi-canal/` (by Projeção
     Web). Appears to be positioned at church secretaries. Unconfirmed.
   - **Sistema Reino** — `sistemareino.com.br`. Church management software with a WhatsApp chatbot. A
     search snippet quoted plans "a partir de R$ 19,90/mês" — **not read from the page, and it would be
     a floor anchor if true, so confirm it before it changes any pricing thinking.**
   - **inChurch** — `inchurch.com.br`. The denominational-standard incumbent named in §2. Unconfirmed
     beyond existence.
   - **Expo Cristã** — `expocrista.com` (see §3 item 6).

   Also set up WhatsApp Business's own greeting/ausência on a spare phone — that is the real default
   competitor and it is free.
7. **Settle the unit economics on paper** (section 6's floor).
8. **Build the waitlist**, and the demo tenant with its own chip.
9. **Do not build the marketing website yet.** Its strongest call to action is *"manda uma mensagem
   para esse número"*. Without a live demo number it is a brochure, and a brochure with no customers
   and no price is a page that has nothing to say.

---

## 9 · How long the first sale actually takes

**Define the finish line as: a church with a CNPJ paying a recurring charge against a nota fiscal.**
Anything looser flatters the timeline. Every row below is judgement, not measurement — nothing here has
ever been done once.

| Segment | Realistic |
|---|---|
| First successful outbound message → church #0 live | weeks, gated on Meta business verification (days, may request documents) |
| Password reset + a notification path | weeks of build |
| Stripe billing (specced, not built) | weeks |
| Nota fiscal — CNPJ/IM/A1, municipality check, accountant, 4 experiments, then code | **months**, and mostly not code |
| The sale cycle itself, once quoting is possible | **2–6 weeks**, with a second conversation and a *"vou conversar com a diretoria"* in the middle |

**The honest estimate: the first paid, invoiced church is roughly 4–6 months out from 2026-08-08 if
nota fiscal starts immediately and nothing surprises — and 8–9 months is the version where something
does.** Something usually does; the municipality-coverage answer alone is ~15 days of pure calendar
time on the critical path if it comes back wrong.

Free pilots move much faster: church #0 in weeks, pilots #2–#3 within one to two months. **Demand is
not the constraint. The gate is.**

**Ten paid churches is therefore a year-plus**, and at any price that clears the floor in section 6, ten
churches does not replace an income. That is not a reason to stop; it is a reason not to quit a job on
the strength of month four.

### The metric trap, named

If Rafael measures *sales* during months 1–4 he will conclude the product failed, when what actually
happened is that the gate has not opened. For those months the real scoreboard is:

- pilots live, and **messages actually answered by the bot**;
- **prayer requests received** — the one flow that proves the product understands a church (built, never
  exercised — [[Whats Left]]);
- named pastors on the waitlist;
- and the leading indicator that beats all of them: **the first pastor who introduces Rafael to another
  pastor without being asked.** That is the signal that this is a business. The first sale is only the
  signal that the paperwork is done.

---

## Revisões

**2026-08-08 — revision 1**, against `.superpowers/sdd/critique-mkt-gtm.md`.

- **R$ 69,90 sourced, not deleted.** The ID Lite price was load-bearing and unsourced. Read from
  `igreja.digital` on 2026-08-08 with the full plan ladder, a staleness caveat, and the warning that
  `igrejadigital.com` is a parked domain. The ceiling argument survives because the number now has a URL.
- **Five external names labelled.** SecretáriaBot, ProchatWeb, Sistema Reino, inChurch and Expo Cristã
  each carry a URL found by search on 2026-08-08, plus an explicit note that the pages were not read.
  None was deleted — the field-trip task depends on them, so the dependency stays visible.
- **`[[Backlog]]` miscitation fixed.** `Backlog.md` has no competitor content; the §3 item 6 cite is
  removed and the correction stated in place. The other `[[Backlog]]` cite (spam / broadcasts) is
  correct and now names the exact entry.
- **Conselho cadence marked unverified.** "Monthly, often a breakfast" is flagged as an unchecked
  impression; the denominational vocabulary beside it is unchanged.
- **Phone-vs-computer answered from the code**, not deferred: no viewport meta tag, no media queries,
  fixed 880px container, mobile polish unstarted per [[Whats Left]]. The ICP criterion changed from
  "already at a computer" to a named person who reliably opens the panel, and a 15-minute product task
  was added (§8 item 3) that must happen before the table disqualifies anyone.
- **Stage 7 corrected in both directions.** The critique said stage 7 is not done; [[Whats Left]] proves
  the Neon migration and provisioning did happen. Source of truth wins, so the text now states what
  actually ran *and* that "church #0 is live" is still false.
- **Chip now precedes the demo**, matching [[Sales Kit]]; the two assets are marked as needing to move
  together.
- **The card script's billing promises are cut.** This is the one place the critique was wrong by the
  governing rule: it cleared "sete dias de prazo / nada é apagado" against [[Decisions Log]], but
  [[Whats Left]] puts Stripe under *specced, not built* — a written decision is not a running feature.
  The replacement concedes the card is Rafael's convenience and uses the future tense. "Faz a coisa se
  resolver sozinha" is gone.
- **New honest disclosure, not a new promise:** step 3 of the first conversation now tells the pastor
  out loud that nothing warns the church when a member is waiting.
- **Register aligned to *o senhor*** throughout; *"Não cobra"* → *"Não cobro"*; *"em um grupo"* →
  *"num grupo"*; *"proposta"* → *"uma proposta"*; *"com ela"* → *"com essa pessoa"*.
- **Also added, because §1 was silent on it:** there is no billing of any kind today, and no church has
  ever used this. Links to the sibling assets added below.
- **Nothing new was promised.** Every edit either removed a claim, sourced a claim, or converted a
  claim into a description of what actually happens.

---

## Related

[[Sales Kit]] · [[Landing Page Copy]] · [[Brand Foundation]] · [[Overview]] · [[Launch Roadmap]] ·
[[Whats Left]] · [[Decisions Log]] · [[Launch Checklist]] · [[Multi-Tenancy]] · [[Menu Inventory]] ·
[[Bot Flow]] · [[Backlog]] · [[Meta WhatsApp Setup]] · [[Hosting & Deploy]]

Specs referenced: `docs/superpowers/specs/2026-08-07-nota-fiscal.md`,
`docs/superpowers/specs/2026-08-07-stripe-billing.md`.
