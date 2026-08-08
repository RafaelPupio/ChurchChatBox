# Go To Market

How a solo operator with no budget, no customers and no nota fiscal gets to the first ten churches.
Strategy is in English; every line a church will read is marked **pt-BR** and is quoted verbatim.

**The uncomfortable frame, first.** Two facts set the whole shape and neither is a marketing problem:
the product cannot legally be sold to a church with a CNPJ until nota fiscal exists ([[Decisions Log]]),
and an outbound WhatsApp message has never succeeded once ([[Whats Left]]). So the honest goal for the
next months is **not revenue**. It is: a live bot, two or three pilot churches that like it, a demo
number another pastor can message, and a named waitlist. Selling starts when the gate opens.

---

## 1 · Ten is the ceiling, not the ambition

Before choosing channels, size the target honestly against what's built. Per [[Whats Left]] there is
**no password reset**, **no monitoring**, **no notification of any kind**, **no onboarding flow** and
**no offboarding**. Every church therefore costs Rafael, by hand: chip guidance, Meta number
verification, credential paste, content help, and a script run every time a volunteer forgets a
password. There is also nothing that tells him the webhook died at 2am.

At that support cost, a realistic solo ceiling is roughly **five to eight churches** before support
eats the week. **Ten is the capacity limit of the current build, not a modest goal.** Passing it is a
product problem (password reset, alerting, self-serve onboarding) before it is a sales problem.

---

## 2 · The ideal first church, and who to walk away from

The targeting constraint that matters most is not size or denomination — it is **the missing
notification**. The realistic failure is: a member taps *Falar com Atendente* at 21h on a Wednesday,
the bot goes silent for them, nobody opens the browser until Sunday, and the member's experience is
that the church ignored him. That is worse than having no bot. The 24h auto-revert ([[Bot Flow]])
caps the damage and does not fix it.

So, until notifications exist:

| Qualify **in** | Qualify **out** |
|---|---|
| A **paid part-time secretary** who is already at a computer on weekdays | An all-volunteer WhatsApp answered from one phone, well, in five minutes |
| Enough volume that the same four questions repeat | Under ~80–100 members where the status quo is genuinely correct |
| An active Instagram sending strangers to the church | No inbound from outside the membership |
| CNPJ, a contador, **and a card on the CNPJ** | No card and no willingness to get one — park, don't argue |
| Autonomous local decision | Denominational HQ already standardised on inChurch — the door is closed |

**Disqualifying is a strategy, not a failure.** A small church where the sister answers in five minutes
is right to say "a gente já faz isso", and pushing past that produces a churn in month three inside the
exact network the referral engine depends on.

---

## 3 · Where the first ten actually come from

Ranked by realistic yield per hour, not by reach. Nothing here is advertising — there is no budget and
paid acquisition against this buyer is not a solo operator's game.

**1 · Church #0 — Rafael's own church. Free, forever.**
Not a customer: the proving ground, the demo, and the only source of true sentences he will have. It
is already stage 7 of [[Launch Roadmap]]. Its second job is to make the first real member conversation
happen somewhere the consequences are survivable.

**2 · The two or three churches Rafael or his pastor can call personally.**
This is the entire first tier and it is not scalable, which is fine — the first ten never are. A pastor
introducing a pastor is the only cold-start mechanism this market has.

**3 · The city's pastors' council / association.**
Most Brazilian cities have a *Conselho* or *Ordem de Pastores*, meeting monthly, often as a breakfast.
Denominational equivalents: *reunião de obreiros* per setor/campo (AD), *convenção estadual* (Batista),
*presbitério* (Presbiteriana). **Do not present.** Go once as a guest of a pastor who already has the
bot, be introduced, show it on a phone at the table for two minutes, leave. A slot on the agenda reads
as a vendor; a phone across a coffee table reads as a brother showing something.

**4 · Pastors' WhatsApp groups — only through a member, never cold.**
Every association has one. Posting into it uninvited is the exact spam behaviour the product's whole
positioning refuses ([[Backlog]]), and it burns the group permanently. The move is to have a pilot
pastor post it himself, in his words, with the demo number. Rafael writing the message for him to
paste is fine and normal; Rafael posting it is not.

**5 · Adjacent suppliers who already bill churches monthly.**
The highest-leverage partner is the **contador specialised in igrejas / terceiro setor** — he serves
dozens of churches, he is trusted on exactly the money question, and he is the same person who gates
the nota fiscal. Also: church sound/AV shops, gráficas that print boletins, and the small agencies that
run church Instagram accounts. These are the only relationships where a **paid referral commission** is
appropriate (it is normal B2B), and they require nota fiscal and a written agreement first — so they
are a phase-3 move, not a now move.

**6 · Expocristã and similar supplier fairs — walk them, don't exhibit.**
A stand costs money that does not exist and generates leads that need a follow-up motion Rafael doesn't
have. Attending is cheap reconnaissance: it is where every competitor in the [[Backlog]]'s neighbourhood
is pitching in person, and where the pricing anchors get set.

**7 · Seminaries, Facebook groups, Instagram, cold WhatsApp to churches.**
Listed to be dismissed. Seminary students have no budget. Cold WhatsApp to a church's public number is
low-yield, risks Rafael's own number, and contradicts everything the product says about not being spam.

**The asset that does more than all of the above: a live number to message.**
There are no testimonials and no case studies, and inventing them is forbidden. The substitute is a
number a pastor can tap right now. Budget **one extra chip** for a permanent demo tenant — provisioning
it is a form, not a deploy ([[Multi-Tenancy]]). Name it unmistakably fictitious (*Igreja Demonstração*)
so it can never be mistaken for a customer. Note: Meta's free test number only reaches a short list of
pre-registered recipients (confirm the current limit — [[Meta WhatsApp Setup]]), so an **open** demo
needs a real chip and a verified number.

---

## 4 · Referral mechanics

Referral is the whole engine, so it has to be a mechanism and not a hope.

- **Ask for a name, never for "spread the word".** The ask is: *"Você conhece dois pastores que
  reclamam do WhatsApp da igreja? Me apresenta em um grupo, eu falo com eles."*
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

**Order matters, and the order is: show, then disqualify yourself, then qualify them.**

1. **Hand him the phone.** Send the demo number, let him tap the menu himself. Thirty seconds beats any
   description, and it makes the "sem download" difference obvious without a word.
2. **Raise the chip before he does.** This is non-negotiable — discovered late it kills the deal, raised
   early it is a protection story.
   > **pt-BR ·** *"Precisa de um chip novo. O número que a igreja usa hoje continua funcionando
   > exatamente como está — ninguém mexe nele. Um número ligado à API oficial da Meta para de funcionar
   > no aplicativo do WhatsApp para sempre, e o histórico não vai junto. Por isso ninguém coloca o
   > número principal da igreja nisso."*
3. **Say what it does not do, out loud, second.** He is about to ask for broadcast, because that is what
   pastors want.
   > **pt-BR ·** *"Ele não manda aviso para a congregação. Só responde quem falou com ele primeiro. É
   > por isso que ele não tem custo por mensagem e é por isso que ele nunca vai parecer spam."*
4. **Then the three qualifying questions.** Listen; do not sell over the answers.
   > **pt-BR ·** *"Quantas mensagens chegam no WhatsApp da igreja numa semana normal?"*
   > **pt-BR ·** *"Quem responde hoje? Posso conversar 15 minutos com ela?"*
   > **pt-BR ·** *"A igreja tem CNPJ e contador? E cartão no CNPJ, ou só PIX e boleto?"*
5. **The nota fiscal status, honestly, before he asks.**
   > **pt-BR ·** *"Hoje eu ainda não emito nota fiscal — estou resolvendo isso. Então não vou te fazer
   > proposta agora. Quando estiver pronto eu te aviso, e aí seu contador tem tudo que precisa."*
6. **Close on a specific next step, and it is the secretary.** *"Posso conversar com quem responde o
   WhatsApp de vocês?"* If the volunteer does not adopt, the subscription dies silently in month three
   and the pastor cancels without drama. She never signs anything and she decides everything.

**Three things never to say:** that another church already uses it; any usage number; and that the
system "é compatível com a LGPD". On the last one, the refusal itself is the argument —
> **pt-BR ·** *"Eu não vou te dizer que o sistema 'é compatível com a LGPD' — isso é uma afirmação
> jurídica, e software nenhum garante isso. Te digo o que ele faz: guarda o número do membro, as
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
> **pt-BR ·** *"É uma mensalidade fixa por igreja. Não cobra por mensagem, não cobra por membro, e não
> aumenta quando a igreja cresce. Sem taxa de instalação."*

**The two boundaries the number has to live between**, both already known:
- **Ceiling** — Igreja Digital's ID Lite at R$ 69,90/mês is an entire management system. This is one
  piece of one channel; pricing near that line makes it look like a whole product's price for a part.
- **Floor** — fixed monthly costs arrive *before* the first church: **Focus NFe Solo R$ 89,90/mês**
  (`docs/superpowers/specs/2026-08-07-nota-fiscal.md`), plus Vercel and Neon moving off free tiers the
  moment there is commercial use ([[Hosting & Deploy]]), plus real support hours per non-technical
  church. The first two or three churches are cost recovery, not income. **Solve this arithmetic before
  the first proposal, not after.**

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
  Sundays. Two weeks does not contain enough Sundays to prove anything. Card-up-front is already the
  billing spec's decision, for the right reason: a trial that ends with no card produces a dark bot and
  a confused pastor after Rafael has spent days on Meta verification.

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

### Card-only is a real loss rate, so measure it instead of arguing it

Many small churches have no card on the CNPJ. The framing to use is the church's own interest —
> **pt-BR ·** *"É cartão. Eu sei que igreja prefere PIX. O motivo é que o cartão é o que faz a coisa se
> resolver sozinha: se a cobrança falhar, vocês têm sete dias de prazo, nada é apagado, e ninguém
> precisa lembrar de pagar."*

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
   until this is ([[Launch Roadmap]] stage 8).
2. **Close the two launch blockers a pilot hits on day one**: password reset, and *some* notification
   when a member is waiting — even an e-mail. [[Whats Left]] lists notification as a wishlist item; for
   go-to-market it is a **blocker**, because a pilot that fails becomes an anti-reference inside the one
   network the referral engine runs on.
3. **Run church #0 live and free, then pilots #2 and #3 from personal relationships.** Give each a
   written one-pager: what they get (everything, free, for N months, Rafael's full attention), and what
   he asks back (find the bugs; if it works, two introductions). Write it down — an unwritten pilot
   becomes an unpaid customer with expectations.
4. **Do the nota fiscal prerequisites that are calendar time, not code**: CNPJ with a services CNAE,
   inscrição municipal, e-CNPJ A1 (confirm the accepted format with the vendor *before* buying),
   confirm Focus NFe covers Rafael's municipality (≈R$ 199 and ~15 days if it does not), and get the
   accountant's answers. Then the four homologação experiments. This is months, and it starts now.
5. **Do the competitor field trip.** Message SecretáriaBot, ProchatWeb and a Sistema Reino demo, and
   set up WhatsApp Business's own greeting/ausência on a spare phone. Being wrong in front of a pastor
   who already tried one of them is expensive; an afternoon is not.
6. **Settle the unit economics on paper** (section 6's floor).
7. **Build the waitlist**, and the demo tenant with its own chip.
8. **Do not build the marketing website yet.** Its strongest call to action is *"manda uma mensagem
   para esse número"*. Without a live demo number it is a brochure, and a brochure with no customers
   and no price is a page that has nothing to say.

---

## 9 · How long the first sale actually takes

**Define the finish line as: a church with a CNPJ paying a recurring charge against a nota fiscal.**
Anything looser flatters the timeline.

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
- **prayer requests received** — the one flow that proves the product understands a church;
- named pastors on the waitlist;
- and the leading indicator that beats all of them: **the first pastor who introduces Rafael to another
  pastor without being asked.** That is the signal that this is a business. The first sale is only the
  signal that the paperwork is done.

---

## Related

[[Overview]] · [[Launch Roadmap]] · [[Whats Left]] · [[Decisions Log]] · [[Launch Checklist]] ·
[[Multi-Tenancy]] · [[Menu Inventory]] · [[Bot Flow]] · [[Backlog]] · [[Meta WhatsApp Setup]] ·
[[Hosting & Deploy]]

Specs referenced: `docs/superpowers/specs/2026-08-07-nota-fiscal.md`,
`docs/superpowers/specs/2026-08-07-stripe-billing.md`.
