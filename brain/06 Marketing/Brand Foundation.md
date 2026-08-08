# Brand Foundation

The rules every church-facing asset obeys: what we're called, what we claim, how we sound, how we look, and what we will never do. Strategy is in English; **every line a church reads is pt-BR** — see [[Decisions Log]].

Ground truth this note is built on: [[Overview]] · [[Bot Flow]] · [[Menu Inventory]] · [[Multi-Tenancy]] · [[Whats Left]] · [[Backlog]]. If this note ever disagrees with those, those win and this note is wrong.

Sibling notes in this folder handle positioning proof, objection handling and site copy. This note governs all of them.

---

## 1. The name

### Two names, not one

| | Name | Where it lives |
|---|---|---|
| **Internal / project** | **Secretária Virtual** | the repo, this brain, the spec, Rafael's own head. **Do not rename.** Fifteen notes and a spec use it; churn for nothing. |
| **In the product, in the member's ear** | *"a secretária virtual da [Igreja]"* — lowercase, generic, possessive | the bot's own greeting, per [[Bot Flow]]. This phrase belongs to **the church**, not to us. |
| **In the market** | **open decision** — see below | the site, Instagram, the proposal, the invoice |

### Why "Secretária Virtual" should not be the name we sell under

It is an excellent *description* and a poor *mark*. Four reasons, in order of weight:

1. **It names the person we promise not to replace.** Our whole answer to the hardest objection is *"não é para tirar a irmã Cida do WhatsApp."* A product literally called *The Secretary* argues the opposite of that sentence before we open our mouths. The buyer hears substitution; the volunteer who has to adopt it hears a threat. This is a positioning problem, not a taste problem.
2. **It is probably already in commercial use in Brazil** — possibly by a direct competitor in this exact category. A name shared with the people we're competing against is not a name. ⚠️ **UNVERIFIED — Rafael must check before this reason is used to justify anything.** No source URL, no date read, no competitor named. The claim is repeated here because the naming recommendation partly rests on it, so the dependency must stay visible rather than be quietly deleted. To verify: search `"secretária virtual" igreja whatsapp` and INPI's marca search, and record the URL + date read next to the finding. **Reasons 1, 3 and 4 stand on their own if this one collapses.**
3. **It is descriptive, so it is not defensible.** INPI treats a plainly descriptive term for the service it describes as unregistrable. We would be building goodwill we cannot own.
4. **The search results belong to another industry.** "Secretária virtual" in Brazil overwhelmingly means a *human* remote assistant. Referral sales — the only channel that matters for a church — is pastor-to-pastor, spoken, and then Googled. A name that fails the Google step is a leaky funnel by construction.

The counter-argument is real and should be recorded: a self-explaining name costs zero education, and a solo operator has no budget to teach the market a new word. **That's why the answer is a lockup, not a replacement.**

### The lockup

```
[MARCA]
secretária virtual para igrejas
```

The mark carries ownership, memory and search. The descriptor carries instant comprehension and must sit adjacent to the mark on **first use in every asset** — site header, proposal cover, Instagram bio, e-mail signature. After first use, the mark stands alone.

### Recommendation for the mark (Rafael decides)

Prefer a **place**, not a person. A person-name (Marta, Cida) is warm and instantly Brazilian, and doubles down on exactly the substitution frame we're trying to escape. A place-name says *here is where questions get answered* and leaves every human in the building employed.

| Candidate | For | Against |
|---|---|---|
| **Átrio** | the space where you're greeted before the service — semantically exact, short, ecclesiastical without being devotional, sayable, unowned in this category | the accent complicates the domain; slightly erudite for a small Assembleia congregation |
| **Portaria** | where you ask and someone answers, any hour; very Brazilian, everyday | collides with the government-decree sense and with the condomínio doorman |
| **Varanda** | warm, no accent, easy to spell and say | semantic stretch — has to be explained |

Lead candidate: **Átrio**. Three checks before it becomes a decision — an INPI search in class 42/38, `.com.br` plus the Instagram handle, and saying it out loud to two pastors who are not Rafael's friends.

**Timing:** the name does not block the pilot. It blocks the first public asset. Rename after churches have started referring you and you pay for it twice.

---

## 2. Positioning

### The statement (internal)

> For **small and mid-size Brazilian churches** that answer the church WhatsApp by hand and lose the message that arrives at 22h on a Saturday, **[Marca]** is **a WhatsApp number that answers on its own** — replying to the questions that repeat, in words the church itself wrote, and going silent so a real person can take over when a real person is what's needed.
>
> Unlike **church-management platforms with a member app**, nothing gets installed, no account is created and **the member** never has a password to forget — the 70-year-old who uses WhatsApp and nothing else can use it on the first try.
>
> Unlike **generic WhatsApp chatbot builders**, there is no flow to draw and no English to translate: the bot's own Portuguese — saudação, cabeçalho do menu, "Ver opções", erro, oração, atendimento — is seeded and editable ([[Decisions Log]]), and the panel speaks church, not sales.

⚠️ **"no password is forgotten" is true of members and false of staff** — see §6 on password recovery. The sentence is safe here only because the member framing is adjacent to it; do not lift the clause into pt-BR site copy on its own.

⚠️ **The third paragraph used to say the product "arrives with the menu already built."** It does not: a provisioned church starts with one menu row, 🔒 Privacidade, and every content item is typed by hand afterwards. See the gap list below and §4.

### What we are explicitly not positioned as

Not church management. Not a member database. Not a giving platform. Not a broadcast tool. Not AI. Every one of these is a real thing the buyer may hope for, and each is a [[Backlog]] "parked" or "won't do" — see [[Overview]].

### The pt-BR lines

- **Short line:** *A secretária da igreja, disponível às 22h de terça.*
- **One sentence:** *É um número de WhatsApp da igreja que responde sozinho as perguntas de sempre, com as palavras que a própria igreja escreveu — e, quando é uma pessoa que precisa atender, ele para de responder e a conversa fica guardada na Caixa de Entrada do painel até alguém da igreja abrir.*

  Two things were cut from this line and must not come back. **"chama uma pessoa"** — nothing calls anyone; there are no notifications (§6), and the conversation sits in an inbox someone has to open, which is why the honest ending names the opening. **"horários, endereço, agenda, ofertas"** — those four are rows in a local development fixture, not in any real church's menu; naming them implies the product ships with them written.
- **Alternate short line:** *A pergunta de sempre, respondida na hora, onde o povo já está.*

### The four beats, in this order, in any first-contact asset

1. **O que é**, em uma frase concreta (never abstract; see voice).
2. **O que ele não faz** — chip novo, não manda aviso, não tem IA, não substitui ninguém.
3. **Por que as palavras são da igreja** — nada vem de fábrica, nem a mensagem de erro.
4. **O convite honesto** — nenhuma igreja está usando ainda; as primeiras moldam o produto.

Beat 2 sits second **on purpose**. The chip is the hardest objection in the sale ([[Decisions Log]]) and it is discovered by the treasurer weeks in if we bury it. Disclosing the constraint early is what buys the rest of the conversation with this buyer.

### What the positioning statement is currently writing a cheque for

The statement above describes the product **as designed**, and every public asset derived from it will be read as a description of the product **as it runs today**. Those are not the same thing yet, per [[Whats Left]]:

- **The outbound half has never succeeded once.** The inbound half is proven against live infrastructure — a member's message is received, verified, deduped and recorded. The reply has never actually left, because it needs real Meta credentials. "Responde sozinho" is therefore an unexercised claim until one real end-to-end conversation happens.
- **The menu arrives empty.** `provisionChurch()` creates a church with exactly **one** menu row — 🔒 Privacidade — and nine free slots under WhatsApp's 10-row ceiling ([[Whats Left]]). Every content item is typed by hand afterwards, through a menu editor **never driven in a browser** ([[Whats Left]]). What is genuinely pre-written is the bot's own voice: greeting, menu header, button label, fallback, unsupported-media, error, prayer and handoff strings, all as editable seed rows ([[Decisions Log]]). Claim that, not a ready-made menu.
- **Caixa de Entrada and Pedidos de Oração are built but never exercised** — no real conversation has landed in either.
- **Meta business verification is a blocker** for a real chip and for production. Do not promise an install date, a "em uma semana já está no ar", or any onboarding timeline that depends on it.

None of this changes the positioning. It changes **when a public asset may ship**: nothing goes out claiming the bot answers until the first send has actually succeeded. This is pre-flight item 9.

---

## 3. Voice and tone

Rafael is one person selling to a pastor who has been burned by a freelancer before. The voice is **a competent neighbour explaining something**, not a company announcing a solution. Corporate SaaS voice is not merely off-brand here; it is the sound of the vendor who disappears.

### Five traits

**1. Concreta antes de abstrata.** Name the Saturday, the hour, the question.
- ❌ *Disponibilidade 24/7 para os seus membros.*
- ✅ *Sábado, 22h40. Alguém pergunta que horas é o culto de domingo e recebe a resposta na hora, sem acordar ninguém.*

**2. Diz o "não" primeiro.** The constraint disclosed first reads as competence; the same constraint discovered later reads as a trap.
- ❌ *Fazemos a migração do seu número em minutos.*
- ❌ *Só precisa de um numerozinho novo, detalhe.*
- ✅ *Precisa de um chip novo. O número que a igreja já usa continua funcionando exatamente como está — ninguém mexe nele. Um número ligado à API oficial da Meta para de funcionar no aplicativo do WhatsApp para sempre, e o histórico de conversas não vai junto. Por isso ninguém coloca o número principal da igreja nisso.*

**3. Respeita quem já faz o trabalho.** The volunteer is the adopter. Copy that diminishes her kills the subscription in month three.
- ❌ *Chega de perder tempo respondendo mensagem manualmente.*
- ✅ *Não é para tirar a irmã que cuida do WhatsApp. É para ela não responder "o culto é 19h" pela milésima vez — e para o visitante de sábado à noite não ficar sem resposta até segunda.*

**4. Sem pressa, sem susto.** Church decisions take two to six weeks and pass through a board. Urgency reads as pressure and pressure reads as risk.
- ❌ *Últimas vagas! Garanta já a sua.*
- ❌ *Sua igreja está perdendo membros por não responder rápido.*
- ✅ *Não tem pressa. Converse com quem decide junto com o senhor e eu mando uma mensagem daqui a duas semanas.*

  (*diretoria* assumes Assembleia governance; a Baptist church says *ministério* or *conselho*. "Quem decide junto com o senhor" fits every denomination we sell to.)

**5. Fala igreja, não fala software.**

| Não escreva | Escreva |
|---|---|
| solução, plataforma, ferramenta | o robô, a secretária virtual, o painel |
| engajamento, jornada do membro | as pessoas voltarem a perguntar, o visitante achar o endereço |
| onboarding | a primeira configuração |
| dashboard | painel |
| inbox / ticket | Caixa de Entrada / atendimento |
| usuário | membro (ou visitante) |
| cliente (em copy para igreja) | igreja |
| eventos recorrentes | o culto de domingo, a vigília, a agenda do mês |
| otimizar, escalar, disruptivo, ROI | (nunca) |

### Three registers

| Register | Tratamento | Notes |
|---|---|---|
| **Vendor → pastor, spoken** | **o senhor / a senhora** | deferential by default in a first conversation, especially with an older pastor. Drop to *você* only when he does. |
| **Vendor → church, written (site, proposal, panel)** | **você** | warm, direct, never plural-corporate ("nós da empresa"). Rafael writes in the first person singular: *eu instalo, eu respondo, eu não vou te dizer que…* |
| **Bot → member** | **você** | but this is **not our voice — it is the church's**. See below. |

### The bot's defaults are someone else's voice

Every string the member sees is a seed row the church can rewrite ([[Data Model]]). Our job is to write a **first draft of a church's voice** that is plain enough to be left alone and easy to make theirs. That means: warm, short, second person, 🙏 and ❤️ where a church would actually use them, no vendor personality, and **no trace of the brand anywhere a member can see it**. The member never learns our name.

### Panel voice: calm, never blaming

The panel is operated by a volunteer who is afraid of breaking something.
- ❌ *Erro ao processar sua solicitação.*
- ✅ *Não deu para salvar agora. Nada do que você escreveu foi perdido — tente de novo em alguns segundos.*
- ❌ *Acesso negado. Campo somente leitura.*
- ✅ *Esses dados do WhatsApp são configurados na instalação e não dá para mudar por aqui. Fale com quem instalou o robô.*

Note the impersonal *"não deu para salvar"* rather than *"não consegui salvar"*. The written first person singular belongs to **Rafael** (see the register table); the panel is not Rafael, and a system failure narrated in his voice is ventriloquism. The panel states facts calmly and never blames the volunteer.

> **Billing copy does not exist yet and must not be written from imagination.** Stripe is specced, not built ([[Whats Left]]) — there is no automatic `past_due`, no grace period, no automatic suspension and no reactivation. A previous version of this note carried an approved panel string promising *"o robô continua respondendo por mais 7 dias"* and *"nada é apagado em nenhum momento"*; both described a subsystem that does not run, and the second was an unbounded retention promise nothing in the product could honour — no purge exists ([[Whats Left]]). **Both are withdrawn.** When billing exists, write the copy against the shipped behaviour and scope any retention statement to the cause: *"nada é apagado por causa da cobrança"*, never *"nada é apagado"*.

### Religious language: use the vocabulary, never borrow the authority

Rafael is a vendor, not a pastor. Church **vocabulary** is ours to use freely — culto, agenda, secretaria, membro, visitante, ministério, GD, oferta, congregação. **Devotional language is not**: no Bible verses in marketing, no *"Deus abençoe"* signing off a sales e-mail, no *"a obra do Senhor"* framing a price. Verse-quoting to sell software is the most common move in this market and a discerning pastor reads it as manipulation instantly. The product's own default strings may be warm and may carry 🙏 — because there it is the church speaking to its own people.

---

## 4. Visual direction

### The feeling

**A igreja's secretaria on a Saturday afternoon** — quiet, ordered, warm, a little institutional in a good way. Paper and ink, not screens and glow. Stationery, not tech.

### The anti-brief (this is the most useful part for a designer)

None of the following, ever: purple-to-blue tech gradients · glowing crosses · doves · rays of light · stained-glass photo overlays · raised hands in worship with a heavy vignette · gold-foil serif logotypes · a Bible on a wooden table · 3D robot mascots · smiling multi-ethnic teams around laptops · Trajan, Cinzel, blackletter, script, or wide-tracked all-caps Montserrat · drop shadows · **any gradient at all**.

Every competitor in this market looks like at least three of those. Flat, warm and quiet is the cheapest available differentiation.

### Colour

Brand palette — warm paper, ink blue, one clay accent. **Never** WhatsApp green (`#25D366`) as a brand colour: it invites a Meta brand-guideline problem and makes us look like a WhatsApp clone.

| Role | Name | Hex | Use |
|---|---|---|---|
| Primary | Azul-tinta | `#16324A` | logotype, headings, primary buttons |
| Primary light | Azul-tinta claro | `#2E5A7D` | hover, secondary buttons, links |
| Accent | Terracota | `#BF5B3C` | ≤10% of any surface: rules, marks, large numerals, underlines |
| Accent dark | Terracota escuro | `#9C4529` | the accent when it must carry **text** (see contrast note) |
| Background | Papel | `#FAF7F2` | page background — never pure white |
| Surface | Papel escuro | `#EFE8DE` | cards, table stripes, dividers |
| Body text | Grafite | `#23282E` | never pure black |
| Secondary text | Cinza-pedra | `#5C574F` | captions, labels — **on Papel *and* on Papel escuro** |

Status palette — **panel only, never decorative.** Brand colours never indicate state; status colours never appear as ornament. The two sets are disjoint. Every one of these carries a text label, so every one is held to AA (4.5:1), on **both** Papel and Papel escuro, since status badges sit on cards.

| State | Hex | on Papel `#FAF7F2` | on Papel escuro `#EFE8DE` |
|---|---|---|---|
| Ativo / sucesso | `#3F6B4E` | 5.74 ✅ | 5.04 ✅ |
| Em atraso | `#7A5410` | 6.33 ✅ | 5.56 ✅ |
| Suspenso / erro | `#97302A` | 7.09 ✅ | 6.23 ✅ |
| Inativo | `#5C574F` | 6.70 ✅ | 5.89 ✅ |

**Contrast, computed 2026-08-08** (WCAG 2.1 relative-luminance formula, ratios rounded to 2dp):

| Pair | Ratio | Verdict |
|---|---|---|
| Azul-tinta `#16324A` on Papel | 12.37 | ✅ everywhere |
| Azul-tinta claro `#2E5A7D` on Papel | 6.84 | ✅ AA body |
| Grafite `#23282E` on Papel | 13.89 | ✅ everywhere |
| Terracota `#BF5B3C` on Papel | 4.11 | ✅ large text ≥24px, icons, borders · ❌ body text and small links |
| Terracota escuro `#9C4529` on Papel | 5.96 | ✅ the accent whenever it carries running text |

**Two colours were changed for failing this check, not for taste:**
- **Em atraso** was `#A8761B` — **3.73:1 on Papel, a fail** for a badge label, and worse on a card. Replaced with `#7A5410`, the same amber darkened until it clears AA on both surfaces.
- **Cinza-pedra** was `#6E6960` — 5.10 on Papel but **4.48 on Papel escuro**, just under AA exactly where captions actually sit (on cards). Replaced with `#5C574F`. Note the status **Inativo** shares this value by design: an inactive thing should read as ordinary secondary text, not as a colour.

Status must always be paired with a word (*Ativo · Em atraso · Suspenso · Inativo*), never colour alone — colour-blind users and printed bulletins both.

Anyone re-running these: `#EFE8DE` is the worst-case surface for every foreground here, so check against Papel escuro, not Papel.

### Type

Both faces must be free and must carry full Latin-Extended — **ã õ ç é ê á à ú í have to render correctly**; many display faces break on `ã`.

- **Headings and logotype:** **Source Serif 4**, Semibold. Humanist, authoritative, not ecclesiastical.
- **Body and UI:** **Source Sans 3**. Pairs with the serif by design, humanist rather than geometric (geometric = SaaS), legible at small sizes.
- **Scale:** marketing body 17px/1.6; panel body 16px/1.55. Headings 40 / 32 / 24 / 20. Line length 60–72 characters. **Minimum body size 16px anywhere** — this audience skews older. No grey-on-grey.
- Left-aligned. No centred body copy. Single column.

### Imagery

- **The hero image is a WhatsApp conversation on a phone.** It is the product, it is instantly legible to a non-technical pastor, and it costs nothing. Nothing beats it — not an illustration, not a laptop mockup. ⚠️ **It cannot be a photograph of the bot working, yet.** No outbound message has ever succeeded ([[Whats Left]]), so a genuine screenshot of the bot replying does not exist today; until one does, any hero is a constructed mock-up with demo data, and pre-flight 9 governs what it may be captioned to claim.
- **Second tier: Brazilian church spaces at rest** — empty plastic chairs, the bulletin board, the secretaria's desk, the sound table, a ceiling fan, tiled floor. Rafael should shoot these on a phone at a real church. American stock photography of churches reads as fake to a Brazilian pastor within a second.
- No crowds, no worship-hands, no pastor-in-a-photo (it implies he is a customer — see §5).
- **Icons:** monoline, 1.5px stroke, rounded joins. But where the product already uses an emoji, **show the emoji**, don't draw a competing icon. The marketing must look like the screenshots. The only emoji a real church is guaranteed to have is **🔒** — read the next bullet before putting any other one in an asset.
- **A real church starts with one menu row, not nine and not ten.** `provisionChurch()` creates the church, its admin and the single 🔒 Privacidade item ([[Whats Left]]), leaving **nine free slots** under WhatsApp's 10-row list ceiling. The nine-item menu in [[Menu Inventory]] — ⛪ 📍 📅 🗓️ 🔥 👥 💚 🙏 💬 — is `src/db/seed.ts`, labelled in the file itself as a local development fixture that must never run against production. It is a *plausible* menu, not a shipped one. Where the two notes disagree, [[Whats Left]] wins, because it records what ran against the live database.

  Three consequences for marketing. **(a)** A screenshot of a full menu is a **mock-up of a configured church** and must be captioned as one, never as what a church sees on day one. **(b)** The previous version of this note said the opposite — 10 rows, no slot free, "never write *é só adicionar o que a sua igreja precisar*" — and that was **false**; it forbade the one honest sentence and mandated a screenshot no church could produce. **(c)** The correction does not license the sentence either: adding items runs through a menu editor **never driven in a browser** ([[Whats Left]]), so it stays out of any asset shipping before someone has actually used it. [[Menu Inventory]]'s "we're at 9 — exactly one slot left" describes the fixture, not a church, and needs correcting there; that is not this note's edit to make.
- **The cross:** keep it out of the vendor's mark entirely. We stand next to many denominations and are not a ministry. Where a cross appears inside the product it is because the church put it there.

### Logo and layout

- A **wordmark** in Source Serif 4 Semibold, plus at most one small monoline mark — a speech bubble whose tail reads as a simple arch or doorway is the direction. It must work at 16px as a favicon, in one colour, and **printed in black on a church bulletin**.
- 8px corner radius (not 24px pills). 1px `#E4DACE` borders instead of shadows. Generous whitespace. Flat, paper-like.
- Touch targets ≥44px.

---

## 5. Wording rules the product already enforces

These are not style preferences. They are product decisions with a paper trail, and marketing does not get a vote.

| Rule | Source |
|---|---|
| **"Ofertas" — the word *dízimo* appears nowhere.** Not in the menu, not on the site, not in a deck, not spoken in a demo. Not even "Dízimos e Ofertas". | [[Decisions Log]], [[Menu Inventory]] |
| **pt-BR only** for anything a church or member reads. Brazilian Portuguese, not European. Multi-language is its own future project. | [[Decisions Log]] |
| **Never claim LGPD compliance.** Say what the system does. | [[Multi-Tenancy]], [[Decisions Log]] |
| **UI names must match the panel exactly:** Conteúdo · Configurações · Caixa de Entrada · Pedidos de Oração · "Encerrar atendimento" · "Ver opções". If copy and screenshot disagree, the copy is wrong. | [[App Structure]] |
| **"chip novo" / "um número só do robô".** Never *migrar o número*, never *conectamos o WhatsApp da igreja*. | [[Decisions Log]] |
| **"o robô"** in speech, **"a secretária virtual"** in writing. Never *chatbot*, *assistente virtual*, *agente*, *IA*. | — |
| **Nota fiscal: "hoje não existe."** Never *"a gente emite nota"*, never *"nota fiscal inclusa"*, never a future date. It is a launch dependency whose first task is four experiments against a homologação account, and it is gated on Rafael's accountant, CNPJ, inscrição municipal and A1 certificate. | [[Decisions Log]], [[Whats Left]] |

**The nota fiscal sentence, approved verbatim** (spoken; the treasurer asks this, not the pastor):

> *Hoje eu não emito nota fiscal. Está sendo construído, e eu não sei dizer a data. Enquanto não existir, eu não vou cobrar de uma igreja que precisa de nota — não seria honesto. O que dá para fazer agora é rodar como piloto, sem cobrança, e eu volto quando a nota existir.*

This is not an objection to be handled, it is a **gate**: a church with a CNPJ generally cannot pay a recurring invoice without one ([[Decisions Log]]). Any conversation that reaches the treasurer before the subsystem exists ends in *"volte quando tiver nota"*, and the asset that pretended otherwise is the reason the pastor stops believing the rest. Say it before the treasurer has to ask.

**The LGPD sentence, approved verbatim** (written register, *você*):

> *Eu não vou te dizer que o sistema "é compatível com a LGPD" — isso é uma afirmação jurídica, e software nenhum garante isso. Te digo o que ele faz: guarda o número de WhatsApp do membro, as mensagens daquela conversa e o pedido de oração, se ele enviar. Tem um item 🔒 Privacidade no menu que explica isso ao membro, em português. Cada igreja enxerga só os dados dela. A igreja é a controladora — os botões são de vocês, não meus.*

**The same sentence, spoken to a pastor** (*o senhor* — §3 mandates this register for the first spoken conversation, and this is an objection answer, so it is almost always spoken first):

> *Eu não vou dizer ao senhor que o sistema "é compatível com a LGPD" — isso é uma afirmação jurídica, e software nenhum garante isso. Digo o que ele faz: guarda o número de WhatsApp do membro, as mensagens daquela conversa e o pedido de oração, se ele enviar. Tem um item 🔒 Privacidade no menu que explica isso ao membro, em português. Cada igreja enxerga só os dados dela. A igreja é a controladora — os botões são do senhor, não meus.*

Forbidden variants: *100% compatível com a LGPD* · *em conformidade com a LGPD* · *adequado à LGPD* · *seus dados estão seguros e protegidos pela lei*.

**This note's version supersedes every other.** [[Sales Kit]] carries a longer variant of the same paragraph that adds *"esse isolamento é testado por uma suíte que ataca o próprio sistema"*. That clause is dropped here on purpose: the isolation is proven **in tests and against the live database** ([[Whats Left]], [[Multi-Tenancy]]) — not in production with real traffic, because there is no production traffic. Said aloud to a congregation's lawyer, "testado" invites the follow-up "testado onde?", and the honest answer is weaker than the sentence sounded. The version above claims only the observable fact (*cada igreja enxerga só os dados dela*). The Sales Kit variant must be replaced with this one when that note is next revised; it is not this note's edit to make.

**One live gap to name if pressed, never to volunteer as if solved:** the seeded 🔒 Privacidade text tells the member he may ask for access, correction or deletion **by contacting the church's secretaria** — and the Art. 18 tooling that would carry any of that out **is not built** ([[Whats Left]], [[Multi-Tenancy]]). Today it is a manual job, by hand. Do not write copy implying deletion, export or access requests are automated.

⚠️ **A previous version of this note said that item promises deletion after 12 months. It does not, and an asset repeating that would put a false retention promise in front of a church's lawyer.** The 12-month sentence was removed from the product on 2026-08-08, precisely because nothing deleted anything ([[Decisions Log]]); it returns only in the commit that ships the purge. Never restore the figure to an asset while it is absent from the product — check the live seed text, not this note's memory of it.

---

## 6. What the brand must never do

**No fake urgency.** No countdowns, no "últimas vagas", no "o preço sobe dia X", no expiry date invented for a proposal. The real cycle is two to six weeks through a board; manufactured urgency reads as pressure, and pressure is what a pastor who was burned by a freelancer is scanning for.

**No invented statistics.** No "70% das mensagens são as mesmas quatro perguntas". No "igrejas economizam X horas por semana". No response-time improvements. If a number appears in an asset, its source must be nameable **in the same sentence** — and we have no numbers of our own, because nothing is in production ([[Whats Left]]).

**No implying other churches use it.** Zero churches use this. No logo wall, no "junte-se a centenas de igrejas", no "nossos clientes", no testimonials, no case studies, no invented panel screenshots attributed to a church, no photo of a pastor that could be read as an endorsement. Not even the hypothetical plural — *"as igrejas que usam"* will be heard as a claim. The only honest frame is the pilot offer: *nenhuma igreja está usando ainda; você seria a primeira, e é por isso que eu vou estar do seu lado toda semana.*

**No claiming what isn't built.** Specifically, and each of these will be tempting:
- **No notifications of any kind exist.** Never write or imply that staff are alerted when a member asks for a person or sends a prayer request. Someone has to open the panel. This is the product's most serious operational gap and copy must not paper over it.
- **Nothing watches the bot.** There is no monitoring and no alerting: if the webhook starts failing at 2am, nobody is told, and the bot is silently dead until a member complains to the church ([[Whats Left]]). Never write *"a gente monitora"*, *"funciona 24 horas por dia"* as a reliability claim, or any uptime figure. "Responde a qualquer hora" describes the menu, which is honest; "está sempre no ar" is a claim nobody is in a position to make.
- No broadcasts / avisos. No AI. No member app. No membership, giving or event registration. No multi-language. No analytics — nobody can tell a church which menu items its members actually use.
- **Password recovery: describe only what has shipped, and re-read the source before you do.** [[Whats Left]] records no password reset and no way to change your own password: a locked-out secretary messages Rafael, who runs a script by hand, and every church's first admin starts on a vendor-generated password. **This area is being actively worked on**, so this note may be stale on the day you use it — check [[Whats Left]] rather than quoting the line above. The rule holds either way: never show a recovery flow in a demo or a screenshot before you have used it yourself, and if a locked-out secretary still has to message Rafael, say so plainly.
- **No onboarding flow.** A new admin logs in to a bare menu with no guidance. Do not describe a guided setup, a wizard, or a first-run tour.
- No pricing. **The price is not set.** Sell the structure (mensalidade fixa por igreja, sem cobrança por mensagem, sem cobrança que cresce com o número de membros) and say plainly that the number isn't closed. Never invent one, never say *grátis* or *teste grátis* until a trial is an actual decision.
- **No billing behaviour of any kind.** Stripe is specced, not built. The grace period, the automatic suspension and the reactivation-on-retry all exist on paper only — never describe them as how billing works, in copy, in a demo, or in a proposal.
- No implying a nota fiscal is available before the subsystem exists. See the approved sentence in §5.

**The PIX trap — the demo's most likely ambush.** Two different payment flows collide on screen, and a pastor will spot it in the first demo if we do not say it first:

| Flow | Method | Where it shows |
|---|---|---|
| **Member → church** (ofertas) | the church's **PIX key**, plus bank details | inside an Ofertas menu item **the church creates and fills in itself** — not seeded, but the item most demos will show |
| **Church → Rafael** (mensalidade) | **card only.** No PIX, no boleto | the proposal, the invoice |

So the product **displays PIX and does not accept PIX**. Nobody is deceived by this, but discovering it unassisted looks like a hidden term. The rule: whoever is presenting names it before the pastor does, in the same breath as the card decision, and names the asymmetry honestly — **this decision optimises for the vendor**, because a card is what **would make** the lifecycle automatic once billing exists — none of it runs today, so it is described in the conditional, never the present — and PIX would put Rafael in the loop for every renewal ([[Decisions Log]]). Expect to lose churches to it; many have no card on the CNPJ. Do not argue. And never suggest the pastor's personal card as the workaround — that creates the exact CNPJ-vs-pessoa-física mismatch the nota fiscal exists to fix.

**No screenshots containing real member data.** Ever. Not a real phone number, not a real prayer request, not a real name — a church's membership is sensitive data under Art. 5 II and our own marketing is not exempt. Demo data only, and it should look like demo data.

**No borrowing religious authority.** No verses, no *"Deus abençoe"* from the vendor, no denominational marks implying endorsement.

**No competitor names in public copy.** Comparisons live in internal battlecards, never on the site.

**No promising availability we can't staff.** One person, no SLA, no support desk. Say so.

### Pre-flight, before anything goes public

1. Does the word *dízimo* appear? → remove.
2. Any number about our own results? → remove or source it in the same sentence.
3. Anything implying another church uses this? → remove.
4. Any LGPD compliance claim? → replace with the approved sentence.
5. Do all screenshots use demo data, and does every feature shown actually exist today? → check against [[Whats Left]].
6. Is the chip requirement present and framed as protection?
7. Is a price stated? → remove.
8. Is everything a church reads in pt-BR?
9. **Has one real end-to-end conversation succeeded yet?** The outbound send has never worked once ([[Whats Left]]). Until it does, no public asset may claim the bot answers.
10. **Does the asset mention nota fiscal?** A CNPJ buyer's treasurer will ask. Use the §5 sentence; never imply it exists.
11. **Does a screenshot or demo show an Ofertas item with a PIX key while the asset asks for card payment?** Then the presenter names the collision first — see §6.
12. **Does anything imply a notification, an alert, a guided setup, or billing behaviour?** None of these exist. → remove. **Anything about password reset or password change** → do not answer from this note; check [[Whats Left]], and describe only what has actually shipped.
13. **Do the colours used carry text at AA on Papel escuro `#EFE8DE`, not just on Papel?** Cards are the worst case.
14. **Does any screenshot or sentence imply the church opens the panel to a ready-made menu?** It opens to one row, 🔒 Privacidade. Label a fuller menu as a mock-up of a configured church, and check the emoji you show against §4, not against [[Menu Inventory]].

---

## Revisões

**2026-08-08 (second pass) — revision against `recheck-mkt-brand.md`.** The re-check exists because the first pass closed ten findings and **introduced a new false claim while doing it**. All three of its blockers were verified independently against [[Whats Left]] and the code, and all three are real.

| # | Finding | Verified against | What changed |
|---|---|---|---|
| 1 | **The 10-row menu claim was false** — introduced by the previous pass | [[Whats Left]] §❌ *"a bare menu with one item"*; `provisionChurch()` creates church + admin + the single 🔒 item; `src/db/seed.ts` carries the comment *"LOCAL DEVELOPMENT FIXTURE ONLY — never run this against production"* | §4 rewritten: a real church starts at **1 row, 9 slots free**. The nine-emoji menu is the dev fixture. The derived ban on *"é só adicionar o que a sua igreja precisar"* is withdrawn as backwards — **and not replaced with permission to write it**, because menu editing was never driven in a browser. The retraction is stated in the note so the error is not silently laundered. |
| 2 | **"arrives with the menu already built and the Portuguese already written"** (§2) | `src/lib/church-defaults.ts` seeds system strings only; `PRIVACY_ITEM` is the sole seeded row | Split into the true half and the false half. The bot's own Portuguese **is** seeded and editable ([[Decisions Log]]) — that claim stays. "Menu already built" is cut, and §2's gap list now carries the empty menu, plus pre-flight 14. |
| 3 | **"chama uma pessoa"** in the shipping pt-BR sentence | [[Whats Left]] §❌3; the note's own §6 and pre-flight 12 | Rewritten to what happens: the bot goes silent and the conversation waits in the Caixa de Entrada **until someone opens the panel**. The four named menu items were cut with it; both cuts are annotated in place so they cannot drift back. |
| 4 | Minor — *"a card is what makes the lifecycle automatic"*, present tense | Stripe is specced, not built | → *"would make … none of it runs today"*. |
| 5 | Minor — hero image mandated as *"a real WhatsApp conversation"* | No outbound send has ever succeeded | Kept as direction, gated: no honest photograph of the bot replying exists yet; any hero today is a demo-data mock-up under pre-flight 9. |
| 6 | Minor — *"no password is forgotten"* true of members, false of staff | — | Scoped to **the member** in the sentence, with a ⚠️ forbidding the clause from being lifted alone into pt-BR copy. |

**Found in this pass, missed by both the critique and the re-check — and the most dangerous single line in the note:** §5 claimed *"the 🔒 Privacidade item already tells the member his data is kept for 12 months."* **It does not.** [[Decisions Log]] 2026-08-08 records that sentence being removed from the product because nothing deleted anything, and `church-defaults.ts` now says *"enquanto a igreja precisar"* with a comment forbidding its return until the purge ships. The note was inviting an asset to publish a retention promise the product had already retracted. Corrected in §5, and the stale figure in §3's billing paragraph corrected with it.

**Where the re-check and the source of truth disagree:** they do not, on anything material — every claim it made was confirmed. The one place it slightly overreaches is finding 1's *"forbids the one true sentence"*: *"é só adicionar o que a sua igreja precisar"* is now **permitted by the row count and still blocked by the editor never having been exercised**, so the previous ban was wrong for the wrong reason rather than simply wrong. §4 records both halves.

**Departures from the re-check's suggested fixes:** none of its wording was adopted verbatim where doing so would have traded one claim for another. Nothing was added to this note that the product does not do.

**Still not fixed here, deliberately, and still not lost:** [[Menu Inventory]]'s *"we're at 9 — exactly one slot left"* (it describes the fixture, not a church), and [[Sales Kit]]'s longer LGPD paragraph. Both are sibling notes under concurrent revision.

---

**2026-08-08 (first pass) — revision against `critique-mkt-brand.md`.** Findings closed, and what the source of truth changed on top of them. ⚠️ **Row "Minor" below is retracted** — see the second pass.

| # | Finding | What changed |
|---|---|---|
| 1 | Two conflicting "approved verbatim" LGPD sentences | This note's version is declared **superseding**, with the reason stated in §5: the Sales Kit's extra clause *"testado por uma suíte que ataca o próprio sistema"* claims test-and-staging evidence in a sentence a lawyer will probe. [[Sales Kit]] left untouched — concurrent revision. |
| 2 | Register contradiction: *o senhor* mandated, LGPD sentence uses *te* | Both variants now shipped in §5, written (*você*) and spoken (*o senhor*), with a note that the objection is almost always spoken first. |
| 3 | Status palette unchecked | All ratios computed and tabled. **Two colours changed for failing:** Em atraso `#A8761B` → `#7A5410` (was 3.73:1, a fail) and Cinza-pedra `#6E6960` → `#5C574F` (was 4.48:1 on cards). Critique's figures verified correct, including Terracota 4.11 / 5.96. |
| 4 | *"nada é apagado em nenhum momento"* | Went further than the critique. The critique proposed narrowing it to *"por causa da cobrança"*; the **source of truth wins** — Stripe is not built, so the entire panel string, grace period included, was **withdrawn**, not narrowed. §3 now carries the narrowing rule for when billing exists, and two examples that describe behaviour that runs today. |
| 5 | PIX collision unarmed | §6 now has the two-flow table, the instruction to name it before the pastor does, the honest "optimises for the vendor" framing, and pre-flight item 11. |
| 6 | Nota fiscal appears only as a prohibition | Now a §5 rule row, an approved verbatim sentence, and pre-flight item 10 — the same treatment the chip gets. |
| 7 | *"pela quadragésima vez"* | → *"pela milésima vez"*. |
| 8 | "Seven words:" labelling a nine-word line | Label dropped; the line is unchanged. |
| 9 | *"converse com a diretoria"* assumes Assembleia governance | → *"converse com quem decide junto com o senhor"*, with the denominational note. |
| 10 | Panel speaking in the first person | *"Não consegui salvar"* → *"Não deu para salvar agora"*, plus the rule that the written first person belongs to Rafael and the panel is not Rafael. |
| Minor | §4 cited [[Menu Inventory]] for the 🔒 emoji, which that note doesn't list | Citation corrected. ⚠️ **RETRACTED:** this row then concluded a provisioned church starts at *"10 rows — the WhatsApp ceiling, zero slots free"* and banned copy suggesting a church can add an item. **Both were false** — it starts at 1 row with 9 free. Corrected in the second pass; kept here so the error stays visible rather than disappearing from the record. |
| Honesty | §1.2 competitor claim asserted as fact | Marked ⚠️ **UNVERIFIED** with the searches to run and where to record the URL + date. Not deleted — the naming recommendation partly rests on it, so the dependency stays visible. Reasons 1, 3 and 4 stand without it. |

**Added beyond the critique, from [[Whats Left]] — all removals of claims, no new promises:**
- §2 now states that the **outbound half has never succeeded once**, that Caixa de Entrada and Pedidos de Oração are built but unexercised, and that **Meta business verification blocks production** — so no asset may claim the bot answers before one real send works (pre-flight 9).
- §6 now bans claims about **monitoring/alerting** (none exists — a 2am failure is silent), corrects "no self-service password reset" to **no password change at all**, and adds **no onboarding flow** and **no billing behaviour**.
- §5 names the live gap around the Art. 18 tooling that is not built. ⚠️ **PARTLY RETRACTED:** this pass described the gap as sitting against *"the 12-month deletion the 🔒 Privacidade item promises members"*. That item promises no such thing — the sentence had already been removed from the product. Corrected in the second pass.

**Where the critique and the source of truth disagreed, the source of truth won** — finding 4 is the case, and it is recorded above as such. Nothing in the critique was found to be wrong about the code; the contrast maths it asserted was recomputed and matched to 2dp.

**Not fixed here, and deliberately:** the Sales Kit LGPD paragraph, and [[Menu Inventory]]'s 9-row count. Both are correct edits to make and both live in sibling notes under concurrent revision. They are named above so neither gets lost.

---

## Open decisions

- **The market-facing mark.** Recommendation above; needs Rafael, an INPI search, a domain + handle check, and two pastors' ears. Blocks the first public asset, not the pilot.
- **Whether the descriptor stays "secretária virtual para igrejas"** once a mark exists, or narrows to something that avoids the substitution frame entirely (e.g. *"o WhatsApp da igreja que responde sozinho"*).
