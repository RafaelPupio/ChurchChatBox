# Landing Page Copy

Ready-to-paste **pt-BR** copy for the public page, plus the page structure and the visual brief for each
section. Strategy notes and production warnings are in English; **everything a church reads is Portuguese**.

Related: [[Overview]] · [[Bot Flow]] · [[Menu Inventory]] · [[Multi-Tenancy]] · [[Decisions Log]] · [[Whats Left]] · [[Meta WhatsApp Setup]]

---

## Hard rules this page obeys

Breaking any of these makes the asset unusable, not just weaker.

1. **No testimonials, no church logos, no numbers of any kind.** Nothing is live ([[Whats Left]]).
   No "80% das mensagens", no "economize X horas", no "mais de N igrejas". If a sentence needs a
   statistic to work, the sentence is wrong.
2. **Never "em conformidade com a LGPD"** or any wording that means it. Say what the system *does*
   ([[Decisions Log]], 2026-08-06).
3. **"Ofertas", never "dízimo"** — the word does not appear on this page ([[Menu Inventory]]).
4. **The new chip is in step 1**, not the FAQ. Buried, it becomes a betrayal; upfront, it is proof of honesty.
5. **No feature that isn't built** is described in the present tense. Everything on the not-built list
   is labelled out loud, on the page, in the reader's words. As of 2026-08-08 that list is:
   **notificação, monitoramento/alerta, troca e recuperação de senha, cobrança (Stripe), nota fiscal,
   exportar/apagar dados a pedido, expurgo automático, submenus, offboarding de igreja, redesenho mobile
   do painel.**
   ([[Whats Left]] — re-read it before adding any capability sentence to this page.)
6. **No price.** The CTA is a conversation, which is what makes the missing price survivable.
7. **Every external fact carries a source and a date read, or it is marked unverified.** Meta's pricing,
   Meta's list limits, Meta's verification requirements and any operator's chip price change without
   telling us. Nothing on this page states one as settled unless the source URL and the date it was read
   are recorded in *Fatos externos a verificar antes de publicar* (bottom of this file). Marked-unverified
   is allowed; silently deleting a load-bearing claim is not, because then the dependency disappears.

### The voice decision
The page is written in **Rafael's first person** ("eu"). With zero social proof, the only persuasion
currency available is a named human saying uncomfortable things out loud. A neutral corporate voice
would need proof this product does not have. Every "honest weakness" line on this page is doing the job
a testimonial would normally do — and it only works in first person.

---

## Page structure at a glance

| # | Section | Job | Scroll weight |
|---|---|---|---|
| 0 | Meta tags + prévia de link | The real first impression: this link is sent *inside* WhatsApp | — |
| 1 | Hero | One concrete scene + the promise | full viewport |
| 2 | O problema | Make them see their own Saturday night | short |
| 3 | Como funciona (3 passos) | Chip **and Meta verification** defused inside step 1 | medium |
| 4 | O que o robô responde | The menu, made tangible | medium |
| 5 | Recursos | 6 blocks, differentiators only | long |
| 6 | O que ele NÃO é | Kills wrong expectations before the demo | short |
| 7 | O chip novo e o cadastro na Meta | The hardest objection, its own section | medium |
| 8 | Perguntas difíceis | 6 objections, answered flat — including the three gaps | long |
| 9 | Dados dos membros | LGPD, said honestly | medium |
| 10 | Quem faz isso | Rafael, named, one person | short |
| 11 | As primeiras igrejas + CTA | The offer that replaces social proof | medium |
| 12 | FAQ | Commercial logistics | long, accordion |
| 13 | Rodapé | | short |

---

## 0 — Meta tags e prévia de link

**Job:** Rafael sends this URL *inside a WhatsApp conversation with a pastor*. The preview card is read
before the page is. It has to be honest on its own, because plenty of pastors will only ever see it.

**Copy**

> **`<title>`:** Secretária Virtual — atendimento no WhatsApp para a sua igreja
>
> **`<meta name="description">`:** Uma secretária virtual no WhatsApp que responde às perguntas de
> sempre — horários, endereço, agenda, ofertas, pedido de oração — com as palavras que a sua igreja
> escreveu. Sem aplicativo, sem inteligência artificial.
>
> **`og:title`:** Sábado, 22h40. Alguém pergunta que horas é o culto.
> **`og:description`:** A sua igreja responde na hora, com as palavras dela. Ainda não está no ar em
> nenhuma igreja — estou escolhendo as primeiras.
> **`og:image`:** the same illustrated menu used in the hero. **Never** a photo-realistic fake screenshot.
> **`og:image:alt`:** Ilustração de um menu de WhatsApp com os assuntos de uma igreja.

> ⚠️ **Production rule.** `og:description` must keep the "ainda não está no ar" clause. The preview is
> the one surface a pastor can screenshot and forward; if it over-promises, the honest page behind it
> never gets read.

---

## 1 — Hero

**Job:** one specific scene, not a category description. The reader must recognise their own church in
the first line.

**Copy**

> **H1:** Sábado, 22h40. Alguém pergunta que horas é o culto de amanhã.
> Sua igreja responde na hora.
>
> **Sub:** Uma secretária virtual no WhatsApp que responde às perguntas de sempre — horários, endereço,
> agenda, ofertas, pedido de oração — com as palavras que a sua igreja escreveu. Sem aplicativo para o
> membro baixar. Sem inteligência artificial inventando nada.
>
> **CTA principal:** Quero conversar 20 minutos
> **CTA secundário:** Ver como funciona ↓
>
> **Linha de honestidade (logo abaixo dos botões, fonte menor):** Ainda não está no ar em nenhuma igreja.
> Estou escolhendo as primeiras — e elas não pagam, porque a cobrança ainda nem existe.

**Alternate H1s** (same sub works for all three)
- *A secretária da igreja que não dorme.* — mais curta, menos concreta; boa para anúncio, fraca para página.
- *O visitante achou a igreja no Instagram às onze da noite. Quem responde?* — ótima para igreja que quer crescer.
- *Sua igreja já tem WhatsApp. Falta ele responder sozinho.* — a mais defensiva; usa se o tráfego vier frio.

**Visual**
Full-bleed, one column, generous whitespace. On the right (or below, on mobile): a **phone frame showing
a real WhatsApp conversation** — the greeting plus the open interactive list. Nothing else in the frame.

> ⚠️ **Production rule.** That screenshot must be a **real capture of the real bot**, taken after the
> first successful outbound message ([[Whats Left]] — no outbound send has ever succeeded). Until then,
> ship a visibly **illustrated** menu (flat shapes, obviously a drawing) or ship no phone at all.
> A photo-realistic fake screenshot of a product that has never sent a message is a fabrication.

No stock photography of foreign churches. If a photo is needed anywhere on this page, it is a photo of a
Brazilian church interior, mid-week, empty — not a worship-band crowd shot.

---

## 2 — O problema

**Job:** three scenes, then a disqualification. The disqualification is the persuasion.

**Copy**

> ## As mesmas perguntas, todo mês, para sempre
>
> **Sábado, 22h40.** "Que horas é o culto amanhã?" A irmã que cuida do WhatsApp já dormiu. A pessoa vê a
> resposta no domingo de tarde.
>
> **O visitante do Instagram.** Achou a igreja, gostou, mandou mensagem pedindo o endereço numa terça à
> noite. Ninguém respondeu até quinta. Ele não voltou.
>
> **O pedido de oração que sumiu.** Veio no meio de uma conversa sobre o ensaio do coral, três dias
> atrás. Ninguém orou por ele — não por descaso, mas porque virou uma mensagem no meio de outras
> quarenta.
>
> ### E uma coisa que quase ninguém vai te dizer
>
> Se a sua igreja recebe umas poucas mensagens por semana e alguém responde todas em cinco minutos,
> **você não precisa disto.** Sério. O status quo está funcionando e trocar por um sistema seria piorar.
>
> Isto aqui só faz sentido quando o volume cansou alguém, ou quando o horário das mensagens não bate com
> o horário em que tem gente disponível para responder.

**Visual**
Three cards side by side (stacked on mobile), each with a small timestamp badge — `sáb 22:40`,
`ter 23:12`, `há 3 dias`. Muted card background. The disqualification block below, visually **quieter**
than the cards: no box, no icon, smaller type, plenty of air. It should read like someone lowering their
voice, not like a callout.

---

## 3 — Como funciona, em 3 passos

**Job:** end-to-end mental model in thirty seconds — and the two hard entry truths (chip novo, cadastro
na Meta) land in step 1, where they cannot be accused of hiding.

**Copy**

> ## Como funciona
>
> **1. Um chip novo só para o robô — e um cadastro na Meta.**
> A igreja compra um chip pré-pago comum. O número que a igreja já usa continua funcionando exatamente
> como está — ninguém encosta nele. Além do chip, a Meta exige que a igreja apareça como negócio dentro
> de uma conta empresarial e passe pela **verificação de negócio da própria Meta** — envio de documentos,
> alguns dias de espera, e a resposta é dela, não minha. Eu conduzo o processo com você, mas não controlo
> o prazo nem a aprovação. Hoje esse é o passo mais lento da entrada, e eu explico os dois assuntos com
> calma mais abaixo.
>
> **2. A gente monta o menu junto, com as palavras da sua igreja.**
> Numa conversa, eu pergunto os horários, o endereço, como se chamam os seus grupos, o que entra em
> Ofertas. Escrevo tudo no painel com você. Depois disso, qualquer pessoa da secretaria muda qualquer
> palavra do robô sozinha, de um celular, sem me chamar.
>
> **3. O membro manda mensagem e toca no assunto.**
> Ele recebe a saudação da sua igreja e uma lista para tocar. Toca em "Horários de Culto", recebe os
> horários. Toca em "Pedido de Oração", escreve o pedido, e ele entra numa lista de oração de verdade.
> Toca em "Falar com Atendente", e o robô se cala — a conversa aparece numa caixa de entrada no painel,
> e a secretaria responde pelo mesmo número.

**Visual**
Horizontal three-step rail with a thin connecting line. Numerals large and quiet. Step 3 gets a small
inline phone thumbnail; steps 1 and 2 get a simple line icon (chip, painel). Do **not** make step 1
red or warning-coloured — it is a normal step, told plainly. Making it look like a warning tells the
reader it is a problem before they have decided whether it is one.

> ⚠️ Step 2's "muda qualquer palavra do robô sozinha" is true and stays — menu and bot text are
> self-service ([[Whats Left]]: menu editing is built). It is deliberately worded "qualquer palavra **do
> robô**", because the one thing a secretary *cannot* change alone is her own panel password (§8).

---

## 4 — O que o robô responde

**Job:** make the menu concrete and simultaneously prove it is editable.

**Copy**

> ## O menu é seu — inclusive os nomes
>
> O robô responde uma lista de assuntos que a sua igreja define. Um menu montado numa conversa comigo
> costuma ficar parecido com este:
>
> ⛪ Horários de Culto · 📍 Endereço e Contato · 📅 Agenda de Eventos · 🗓️ Calendário do Mês (uma imagem
> que vocês trocam todo mês) · 🔥 O seu grupo de jovens, com o nome que ele tem · 👥 Os seus grupos de
> adultos, células ou GDs · 💚 Ofertas, com a chave PIX que vocês escreverem · 🙏 Pedido de Oração ·
> 💬 Falar com Atendente
>
> Nada disso é fixo. Se a sua igreja tem Ministério de Louvor, Departamento Infantil ou uma cantata que
> só existe em dezembro, isso vira um item do menu — criado pela secretaria, em português, sem chamar
> ninguém. E o item de dezembro pode dormir o ano inteiro sem perder o texto.
>
> **Cabem 10 assuntos ao todo.** Esse limite é do próprio WhatsApp, não meu — a lista que aparece para o
> membro é a lista nativa do aplicativo, e ela para em 10. Um desses dez lugares já vem ocupado pelo item
> de Privacidade, que explica ao membro o que é guardado — e ele é o único item que já existe no dia em
> que a igreja entra; todo o resto a gente escreve junto no passo 2.
>
> Faça a conta comigo, porque ela importa na hora de montar o seu: o exemplo acima tem nove assuntos, e
> com a Privacidade ele já ocupa os dez. Um menu assim está cheio — para entrar um assunto novo, outro
> precisa sair ou ficar oculto. Por isso a gente escolhe junto o que entra, em vez de você receber uma
> lista pronta e descobrir depois que não cabe mais nada.

**Visual**
Two columns. Left: the menu rendered as WhatsApp's own list UI (illustrated is fine here — it is
obviously a UI diagram). Right: the same list shown as **rows in the admin panel with edit pencils**,
one row mid-edit with a cursor in the text field. The two side by side *are* the argument — screenshot
of the panel is the real proof, and the panel does exist and does render ([[Whats Left]]).

---

## 5 — Recursos

**Job:** six blocks, each a real differentiator. Nothing generic. Alternating layout, one idea per block.

**Copy**

> ## Cada palavra vem da sua igreja — até as que ninguém lembra que existem
> Não é só o texto dos horários. É a saudação, é o "não entendi, escolhe uma opção", é a mensagem quando
> alguém manda um áudio, é a frase de erro, é o nome do botão que abre a lista. Não existe uma frase
> neste produto que eu tenha escrito e a sua secretária não possa reescrever. É isso que faz o robô soar
> como a **sua** igreja e não como um sistema.

> ## O membro não instala nada
> Sem aplicativo para baixar. Sem cadastro. Sem senha para esquecer. Ele já está no WhatsApp — é lá que
> ele pergunta. O irmão de setenta anos que usa WhatsApp e mais nada consegue usar isto na primeira
> tentativa, sem ninguém ensinar. *(Isso vale para o membro. Quem trabalha no painel tem login e senha —
> e sobre senha eu tenho uma coisa desconfortável para te contar lá embaixo.)*

> ## O robô não inventa. De propósito.
> Ele não tem inteligência artificial, e isso é uma escolha, não uma falta. O robô só diz o que a sua
> igreja escreveu. Ele não vai opinar sobre doutrina, não vai dar conselho pastoral, não vai errar um
> horário e não vai improvisar na voz da igreja. Se não entender, ele não chuta: oferece o menu ou passa
> para uma pessoa.

> ## Quando pedem uma pessoa, o robô se cala
> Ninguém quer um robô interrompendo uma conversa que virou pastoral. Quando o membro pede atendimento,
> o robô para completamente **para aquela pessoa** — e só para ela. A conversa continua no mesmo número
> da igreja, agora com gente do outro lado. Quando a secretaria encerra, o robô volta. Se ninguém
> encostar em 24 horas, ele volta sozinho, para que ninguém fique preso no silêncio.

> ## Pedido de oração não é mensagem, é item de lista
> O membro toca, escreve o pedido, e ele é guardado separado — não fica solto no meio da conversa. No
> painel existe uma lista com "novo" e "orado", que é exatamente o que uma igreja faz com pedidos de
> oração. Quem organiza a lista de oração da semana abre uma tela e vê o que chegou.

> ## Número oficial da Meta, sem custo por mensagem — e o número é da igreja
> Muita automação de WhatsApp por aí usa caminho não oficial, e é justamente esse caminho que faz um
> número ser bloqueado. Aqui é a API oficial da Meta. Não vou te prometer que nenhum número nunca é
> restringido — quem decide isso é a Meta, ela avalia a qualidade de qualquer número, e eu não mando
> nisso. O que eu posso dizer com segurança é que o motivo mais comum de bloqueio, a automação não
> oficial, não existe aqui.
> O chip e o número são da igreja. As chaves técnicas de acesso à Meta, hoje, quem opera sou eu: no
> painel a sua equipe vê "✓ Conectado" e nada mais. Isso tem um lado bom — ninguém da secretaria precisa
> aprender o que é um token — e um lado ruim, que é a igreja não administrar sozinha essa conexão hoje.
> É exatamente por isso que eu faço questão de deixar por escrito o que acontece se eu parar de operar.
> E como o robô só responde quem falou com ele primeiro, essa conversa não é cobrada pela Meta.

**Visual**
Alternating image/text rows, 6 blocks. Only blocks 1, 4 and 5 need a visual, and all three should be
**real panel screenshots** (edit field, caixa de entrada, lista de pedidos com os selos novo/orado).
Blocks 2, 3 and 6 are text-only with a single line icon — resisting the urge to illustrate everything is
what keeps the page from looking like every other SaaS site.

> ⚠️ **Production rule.** Blocks 4 and 5 describe code that is written and typechecked but that **no
> human has ever driven against real data** ([[Whats Left]] — caixa de entrada, pedidos de oração, menu
> editing, the 24h handoff revert). Nothing here is false, but drive all four in a browser before this
> page goes public — which the promised panel screenshots force anyway. If a flow breaks when driven,
> the copy changes before publication, not after a pastor finds it.

> ⚠️ **"não é cobrada pela Meta" is an external fact with no recorded source.** See *Fatos externos a
> verificar*. Meta has changed WhatsApp pricing more than once; publish only after the pricing page is
> read, and record the URL and the date.

---

## 6 — O que ele NÃO é

**Job:** kill five wrong expectations before a demo can disappoint. Placed here on purpose: right after
the reader got excited.

**Copy**

> ## O que ele não é
>
> Prefiro que você descubra agora e não na terceira reunião:
>
> - **Não é aplicativo.** Os membros não baixam nada, e por isso mesmo não existe "app da igreja" aqui.
> - **Não é sistema de secretaria.** Não guarda rol de membros, nem frequência, nem célula.
> - **Não controla ofertas.** Ele mostra a chave PIX que vocês escreverem. Ele não recebe, não registra
>   e não soma nada.
> - **Não manda recado para a congregação.** O robô só responde quem falou com ele primeiro. Ele nunca
>   dispara mensagem para ninguém — e essa é justamente a razão de ele não custar por mensagem e nunca
>   parecer spam.
> - **Não substitui quem cuida do WhatsApp da igreja.** Tira dela a mesma pergunta pela milésima vez.
>   O que precisa de gente continua chegando em gente.
> - **Não avisa ninguém.** Não existe notificação nem alarme neste produto hoje — nem quando um membro
>   está esperando atendimento, nem quando o próprio robô para de funcionar. Alguém da equipe precisa
>   abrir o painel. Está detalhado logo abaixo, porque é a limitação que mais pesa no dia a dia.

**Visual**
Plain list, no icons, no red X marks. Typographic restraint here reads as confidence. A monospace or
serif accent for this one section makes it feel like a note written by hand rather than a marketing grid.

---

## 7 — O chip novo e o cadastro na Meta

**Job:** the hardest objection in the sale ([[Decisions Log]], [[Meta WhatsApp Setup]]). Own section,
mid-page, said flatly. Framed as **protection**, not as cost. The Meta verification half is the second
hardest truth and lives here for the same reason.

**Copy**

> ## Sobre o chip novo, sem rodeios
>
> **Precisa de um chip novo. Não dá para usar o número que a igreja já usa.**
>
> O motivo é este, e é definitivo: um número conectado à API oficial da Meta **para de funcionar no
> aplicativo do WhatsApp para sempre**, e o histórico de conversas não vai junto. Não é uma
> configuração que se desfaz. Por isso ninguém, nunca, deve colocar o número principal de uma igreja
> nisso — e eu não faria isso com a sua.
>
> Então funciona assim: **o número da igreja continua exatamente como está**, com as conversas, os
> grupos e as pessoas de sempre. O robô ganha um chip só dele. Um pré-pago comum resolve.
>
> **Quem compra o chip, e o que ele precisa ter:** quem compra é a igreja, e ele fica no nome da igreja
> ou de alguém da diretoria — o número é de vocês, não meu. Serve um pré-pago comum de qualquer
> operadora. Ele precisa continuar ativo, porque é nele que chega o código de confirmação quando a
> conexão é feita e refeita. O robô não gasta o crédito no dia a dia: quem manda e recebe as mensagens é
> a Meta, não o chip. Sobre quanto custa manter uma linha pré-paga ativa, quem sabe é a operadora, e eu
> prefiro te dizer para conferir com ela a chutar um valor aqui.
>
> **A segunda parte, que dá mais trabalho que o chip: o cadastro na Meta.**
> Para um número atender de verdade, a Meta exige que a igreja exista como negócio dentro de uma conta
> empresarial dela e passe pela **verificação de negócio**. É burocracia da Meta: mandar documento,
> esperar análise, às vezes mandar de novo. Leva dias, o CNPJ ajuda, e quem aprova é a Meta — não eu e
> não você. Eu faço o processo junto com você, mas não vou fingir que controlo o prazo. Se alguém te
> vender entrada em WhatsApp automatizado "hoje mesmo", ou não é a API oficial, ou não te contou isso.
>
> **O que isso custa de verdade, e eu não vou fingir que é zero:**
> a igreja passa a ter dois números, e o número novo começa do zero — ninguém tem ele salvo. Divulgar
> leva algumas semanas: bio do Instagram, boletim, um slide antes do culto, um cartãozinho na entrada.
> Eu chego com esse plano pronto e ajudo a montar os textos.
>
> A forma mais simples de pensar nisso: **um número para informação, outro para pessoas.**

**Visual**
Two phone silhouettes side by side, labelled `O número de sempre — continua igual` and
`O número do robô — novo`. An arrow between them is wrong; they are parallel, not sequential. Use a
calm background tint, not an alert colour. This section should read grown-up, not scary.

> ⚠️ **Four external facts here have no recorded source:** the permanence of the Cloud API migration, the
> exact shape of Meta's business verification, the confirmation code arriving on the chip, and the claim
> that the bot does not consume the chip's credit. All four are load-bearing for the section. See
> *Fatos externos a verificar* before publishing. Business verification is also **Rafael's own current
> blocker** ([[Whats Left]] — "Blocked on Rafael"), which is why the copy never implies it is quick.

---

## 8 — Perguntas difíceis

**Job:** answer the objections that decide the sale, in the buyer's own words, before the FAQ. The last
three exist because [[Whats Left]] says they exist. A page whose entire currency is "I tell you the
uncomfortable things" cannot survive a pastor finding one I did not tell him.

**Copy**

> ## Perguntas difíceis, respondidas antes de você perguntar
>
> **"A gente já responde o WhatsApp. A irmã Cida cuida disso."**
> Ótimo — e ela continua cuidando. Isto não tira a Cida do WhatsApp. Tira dela responder "o culto é 19h"
> pela milésima vez, e faz o visitante de sábado à noite não ficar sem resposta até segunda. O que
> precisa de gente continua chegando nela. Se hoje ninguém está cansado e ninguém está sem resposta, eu
> prefiro te dizer para não contratar.
>
> **"Dá para mandar um aviso para todo mundo? Um recado do pastor, o aviso da vigília?"**
> Não manda, e não é limitação temporária: é escolha. O robô só responde quem falou com ele primeiro.
> É exatamente por isso que ele não tem custo por mensagem e é exatamente por isso que o número da
> igreja nunca vai virar aquele número que as pessoas silenciam. Se o que você quer é disparar avisos,
> este produto não é o certo para você, e eu prefiro dizer isso agora.
>
> **"Tem inteligência artificial? Eu vi um por aí que tem."**
> Não tem, de propósito. Esse robô fala em nome da sua igreja. Uma máquina que improvisa vai um dia
> responder alguma coisa sobre doutrina, casamento ou a crise de alguém — e vai responder com a cara da
> igreja. Prefiro um robô que diz só o que vocês escreveram e, quando não sabe, chama uma pessoa. Sendo
> justo com a outra opção: se você quer que o robô converse solto, existem produtos que fazem isso. Este
> não faz.
>
> **"Quando alguém pedir para falar com uma pessoa, como a gente fica sabendo?"**
> A conversa aparece na Caixa de Entrada do painel e o robô fica mudo para aquela pessoa. E aqui vem a
> parte que preciso falar antes de você assinar: **hoje não existe notificação.** Nem e-mail, nem alerta
> no celular. Alguém da equipe precisa abrir o painel — na prática, uma vez por dia, e mais perto dos
> cultos. Notificação está na lista do que vou construir, mas eu não vou te vender uma coisa que não
> existe. Se ninguém encostar na conversa em 24 horas, o robô volta a atender aquela pessoa, para que
> ela não fique falando com o silêncio.
> Tem um detalhe prático junto com esse: **a Meta só permite responder em texto livre até 24 horas
> depois da última mensagem da pessoa.** Passou disso, o painel bloqueia o envio e explica o porquê em
> português. Ou seja: abrir a caixa de entrada todo dia não é zelo, é o que faz o atendimento funcionar.
>
> **"E se o robô parar de funcionar de madrugada? Como vocês descobrem?"**
> Pela igreja me avisando. **Não existe monitoramento nem alarme hoje**: se a conexão cair às duas da
> manhã, nada avisa vocês e nada me avisa. O robô fica calado até alguém perceber. Isso e a notificação
> são as duas primeiras coisas da minha lista de construção — antes de qualquer recurso novo e bonito.
> Eu poderia ter deixado isso escondido nesta página. Se eu deixasse, você descobriria numa madrugada.
>
> **"E se a secretária esquecer a senha do painel?"**
> Ela me chama e eu troco na mão. Hoje o painel **não tem "esqueci minha senha" e não deixa ninguém
> trocar a própria senha**: quem cria a conta é quem define a senha daquela pessoa, e ela fica assim até
> eu mudar. Para uma igreja que quer ser autossuficiente, isso é ruim, e eu sei — está junto com as duas
> respostas de cima nas primeiras coisas da minha lista de construção. Fora a senha, todo o resto —
> texto, menu, horário, saudação — a sua equipe muda sozinha, sem mim.

**Visual**
Q&A blocks, question in bold at a larger size, answer in body. No accordions here — these must be
readable without a click. The three admissions (notificação, monitoramento, senha) get a subtle left
border in a neutral tone so a skimmer's eye lands on them. Do not hide the weakest answers; a reader who
finds them *after* deciding will distrust everything above them.

> ⚠️ These three answers are load-bearing and expire the moment the features ship. When notification,
> monitoring, or password reset is built, this section is edited **the same day** — an admission that is
> no longer true is a different kind of lie. **The password answer is the one at risk right now:** as of
> 2026-08-08 [[Whats Left]] still lists password reset as missing (❌ #1) and that is what this copy
> follows, but it is under active construction. Re-read [[Whats Left]] the day this page is published;
> if reset has landed, this answer, FAQ `#equipe` and FAQ `#textos` all change together, and none of the
> three may be edited without the other two.

---

## 9 — Dados dos membros

**Job:** the LGPD section. Says what the system does; refuses the compliance claim out loud, because the
refusal is itself the strongest line on the page ([[Decisions Log]], [[Multi-Tenancy]]).

**Copy**

> ## Os dados dos membros
>
> Não vou escrever aqui que o sistema "está em conformidade com a LGPD". Essa é uma afirmação jurídica,
> e software nenhum garante isso sozinho — quem te disser o contrário está te vendendo tranquilidade,
> não fato. O que eu posso fazer é te contar exatamente o que o sistema faz.
>
> **O que fica guardado:** o número de WhatsApp de quem escreveu para o robô, as mensagens daquela
> conversa e o pedido de oração, se a pessoa enviar.
>
> **O membro é avisado, em português, dentro do próprio menu.** Existe um item 🔒 Privacidade que conta a
> ele o que é guardado, para quê, por quanto tempo e com quem falar. Ele não precisa procurar isso num
> site — está na mesma lista dos horários de culto. E ele não promete um prazo que o sistema ainda não
> cumpre: enquanto a limpeza automática não existir, o texto diz que os dados ficam enquanto a igreja
> precisar deles, e que o membro pode pedir a exclusão a qualquer momento — pedido que hoje passa por
> mim, na mão.
>
> **Uma igreja nunca enxerga os dados de outra.** Isso não é promessa: é uma bateria de testes
> automáticos que tenta, de propósito, ler os dados de uma igreja usando a identidade de outra, e
> verifica que não vem nada. Eu rodo essa bateria antes de publicar qualquer mudança no sistema. Prefiro
> te mostrar um teste que ataca o sistema a te dar a minha palavra.
>
> **A igreja é a dona dos dados dos seus membros.** Quem responde ao membro é a igreja, e é a igreja
> quem manda no que está guardado. Eu opero o sistema para vocês.
>
> **O que ainda não existe, e você precisa saber antes:** os botões de exportar e de apagar os dados a
> pedido de um membro, e a limpeza automática das conversas antigas. Está tudo desenhado e é um dos
> próximos blocos de trabalho — mas hoje ainda não está pronto, e enquanto não estiver, esses pedidos
> passam por mim, na mão.
>
> Uma observação que o advogado da sua congregação vai fazer, então faço eu: a lista de quem frequenta
> uma igreja revela convicção religiosa, o que a LGPD trata como **dado sensível**. É por isso que este
> assunto ganhou uma seção inteira nesta página em vez de uma linha no rodapé.

**Visual**
Single column, narrower measure than the rest of the page (~60ch), no icons, no shield graphics, no
padlock illustrations. Security iconography reads as marketing here and undercuts the one section whose
entire value is that it does not sound like marketing. Plain text, generous line height.

> ⚠️ **Do not restore a retention period here, and do not delete "por quanto tempo".** The re-check of
> 2026-08-08 called this line blocking on the grounds that the seeded 🔒 Privacidade text promises
> *"as conversas são apagadas após 12 meses"* while no purge exists. **That is out of date.**
> `src/lib/church-defaults.ts` now reads *"enquanto a igreja precisar deles para te atender"*, with a
> comment forbidding the 12-month sentence until the purge ships, and [[Decisions Log]] records the
> change on 2026-08-08. So the page is accurate and the fix has already landed in the product. The
> sentence above now says which of the two it is, so the next reader does not have to open the code.

> ⚠️ The isolation line used to say the suite "roda a cada mudança no sistema", which reads as
> continuous integration. **There is no CI in this repo** (no `.github/workflows`); the suites run when
> Rafael runs them. The copy now says exactly that. If CI is set up later, the stronger sentence becomes
> available — and only then.

---

## 10 — Quem faz isso

**Copy**

> ## Quem está do outro lado
>
> Sou o Rafael. Sou uma pessoa só — não tem equipe, não tem central de atendimento, não tem robô de
> suporte. Isso tem um lado bom e um lado ruim, e você merece os dois.
>
> **O lado bom:** você fala direto com quem construiu. Mudar uma palavra do robô você mesmo faz, no
> painel; e quando precisar de mim, você me manda uma mensagem — não abre protocolo, não entra em fila,
> não explica o caso três vezes. Quem decide sou eu, e a decisão não passa por comitê nenhum.
>
> **O lado ruim:** sou uma pessoa só. Por isso eu deixo por escrito, no contrato, quem procurar, o que
> acontece com os dados da igreja e como a igreja recupera o controle do próprio número se eu parar de
> operar. Se um fornecedor te promete que nunca vai sumir, ele está te prometendo uma coisa que ninguém
> pode prometer. O que dá para combinar é o que acontece se sumir.

**Visual**
A real photograph of Rafael. Not a logo, not an avatar, not an illustration. On a page with no
testimonials and no client logos, a human face is the only trust signal available — and a stock face
would be the exact fabrication this whole page is built to avoid. Small, left-aligned, next to the text.

> ⚠️ **This section makes a promise the product must keep:** a written contract with a named contact, a
> data statement, and a documented path for the church to take over its own Meta credentials. None of
> the three exists today ([[Whats Left]]). Do not publish this section until they do — or cut the second
> paragraph's specifics down to what is actually true on publication day. The first paragraph is safe to
> publish alone; the response-time promise it used to carry ("normalmente no mesmo dia") was removed,
> because this page forbids SLA claims and Rafael is one person.

---

## 11 — As primeiras igrejas (CTA)

**Job:** convert absent social proof into an offer. "You'd be the first" is weak; "I'm choosing a few
churches to build this with, and they don't pay" is a different sentence entirely.

**Copy**

> ## Estou escolhendo as primeiras igrejas
>
> Vou ser direto: **nenhuma igreja está usando isto ainda.** Não tenho depoimento para te mostrar nem
> pastor para você ligar. Inventar isso seria fácil e eu não vou fazer.
>
> O que eu tenho é o seguinte: estou escolhendo poucas igrejas para colocar no ar comigo, e elas **não
> pagam nada até existirem duas coisas que hoje não existem: a cobrança automática e a nota fiscal.**
> Não é generosidade encenada — hoje eu não teria nem como cobrar de você. Em troca, eu quero o que
> dinheiro não compra: vocês usando de verdade, achando os defeitos e me dizendo o que falta. Eu monto o
> menu, eu conduzo o cadastro na Meta com vocês, eu acompanho as primeiras semanas de perto.
>
> Se isso funcionar na sua igreja, você vai ser a igreja para a qual a próxima vai ligar.
>
> **[ Quero conversar 20 minutos ]**
>
> Vinte minutos, no seu WhatsApp ou numa chamada. Eu te mostro por dentro o que já existe, você me diz o
> que a sua igreja pergunta o dia inteiro, e a gente decide junto se faz sentido. Se não fizer, eu falo.

**Form microcopy**

> Seu nome
> Igreja e cidade
> Seu WhatsApp
> Mais ou menos quantas pessoas frequentam? *(chute mesmo, é só para eu saber se isso ajuda vocês)*
> **[ Falar com o Rafael ]**
>
> *Uso esses dados só para te responder. Não entram em lista de e-mail nenhuma.*

**Visual**
Full-width band with a different background tone from the rest of the page. Form on the right (or below
on mobile), four fields, one button. Four fields is the ceiling — the last one is optional and framed as
a favour, which is why it can exist at all. The honesty paragraph must appear **above** the form, not
after it: the offer is the reason the form is worth filling.

> ⚠️ The CTA used to say "eu te mostro o robô funcionando". **No outbound message has ever succeeded**
> ([[Whats Left]]), so a live end-to-end demo cannot be promised on a public page today. The copy now
> promises what is demonstrable: the panel, the menu, the flows as built. Restore the stronger sentence
> the day the first real conversation happens — not before.

---

## 12 — FAQ

**Job:** the treasurer's questions. Accordion; every answer complete enough to be forwarded to a
treasurer without Rafael in the thread.

**Copy**

> ## Perguntas frequentes
>
> **Quanto custa?** `#preco`
> Uma mensalidade fixa por igreja. Não é por mensagem, não é por membro, e não sobe quando a igreja
> cresce. Não tem taxa de instalação. O valor eu fecho na conversa — e, para as primeiras igrejas, ele é
> zero até a cobrança e a nota fiscal existirem, porque hoje não existe nem como cobrar. Uma referência
> honesta para você comparar: pense no que a igreja paga hoje ao escritório de contabilidade, não no
> preço de um sistema de gestão inteiro. Isto aqui é uma peça, não é o sistema todo.
>
> **Tem fidelidade? Contrato de 12 meses?** `#fidelidade`
> Não. É mensal. Se parar de fazer sentido, você para.
>
> **Como se paga?** `#pagamento`
> Preciso ser exato antes de responder: **não existe cobrança nenhuma construída no sistema hoje.** O que
> existe é o desenho, e é um dos próximos blocos de trabalho. No desenho de hoje são **cartão ou boleto**
> — o cartão porque ele deixa a mensalidade correr sozinha, e o boleto porque muita igreja pequena
> simplesmente não tem cartão no CNPJ, e eu não vou desenhar um produto que exclui essas. **PIX não
> entra**, e sobre isso eu não tenho uma data para te dar. Se a sua tesouraria só trabalha com PIX, me
> fala logo na conversa — prefiro saber disso no começo a descobrir na hora de cobrar. E enquanto a
> cobrança não existir, nada disso te afeta: as primeiras igrejas não pagam.
>
> **Vocês emitem nota fiscal? Meu contador vai pedir.** `#nota-fiscal`
> Ainda não, e sei exatamente o que isso significa: sem nota, a sua tesouraria não consegue lançar a
> despesa, e a conversa morre no contador por mais que o pastor tenha gostado. A emissão está sendo
> construída. É por isso que as primeiras igrejas entram sem pagar — não existe cobrança, então não
> existe nota a emitir. Quando a cobrança começar, a nota começa junto.
>
> **E se a igreja atrasar o pagamento?** `#atraso`
> Antes de responder, o mesmo aviso de cima: **não existe cobrança funcionando hoje**, então o que vem
> aqui é como está desenhado, não como está funcionando. O desenho é: o robô não desliga no mesmo dia,
> são sete dias de prazo, e depois disso ele fica em silêncio — mas **nada é apagado**: as mensagens
> continuam sendo registradas, o painel continua legível, e no dia em que o pagamento entrar volta tudo
> como estava, com a caixa de entrada certa. Uma parte desse desenho depende de mim e não de uma máquina:
> um boleto que não é pago não é recobrado sozinho, então quem vai precisar perceber o atraso sou eu. Se
> alguma coisa mudar quando isso for construído de fato, esta página muda junto.
>
> **Precisa de computador? A secretária consegue usar pelo celular?** `#celular`
> O painel abre no navegador, no celular ou no computador. Não instala nada. Sendo honesto sobre o
> tamanho disso: ele funciona no celular — os botões são feitos para o dedo e nada fica escondido fora da
> tela — mas ele ainda não foi *redesenhado* para o celular. Dá para trabalhar; não é o app bonitinho que
> você imagina quando eu digo "abre no celular". Isso está na lista.
>
> **Quantas pessoas da igreja podem usar o painel?** `#equipe`
> Quantas vocês quiserem. Cada uma com o login dela. Quando alguém sai da equipe, vocês removem a conta
> dela no próprio painel, e o acesso acaba na próxima tela que ela tentar abrir — não fica valendo até o
> fim do dia nem até o fim do prazo do login. Duas coisas para você já saber: quem cria a conta é quem
> define a senha da pessoa, e hoje ninguém troca a própria senha sozinho — isso ainda passa por mim.
>
> **A gente consegue mudar os textos sozinho depois?** `#textos`
> Consegue tudo o que o robô fala. Horários, endereço, os nomes dos grupos, a saudação, até a frase que
> o robô diz quando não entende. Essa é a ideia inteira do produto: você não fica dependendo de mim para
> trocar o horário do culto de domingo. A exceção é senha de painel, que hoje ainda passa por mim.
>
> **E se a gente quiser mais de dez assuntos no menu?** `#dez-assuntos`
> O limite de dez é do WhatsApp, não meu. Quando uma igreja chegar perto disso, a saída são submenus —
> "Grupos" abrindo uma segunda lista. Ainda não construí, porque nenhuma igreja chegou lá. Quando
> chegar, a gente resolve.
>
> **Dá para atender por esse número pelo celular, como a gente faz hoje?** `#atendimento`
> Não. Um número da API oficial não abre no aplicativo do WhatsApp — é a mesma razão pela qual ele
> precisa ser um chip novo. O atendimento humano acontece no painel, pelo navegador. E vale saber de uma
> regra da Meta que muda a rotina: só dá para responder em texto livre **até 24 horas depois da última
> mensagem da pessoa**. Passou disso, o painel bloqueia e explica. Como também não existe notificação,
> na prática isso quer dizer que alguém precisa abrir a caixa de entrada todo dia.
>
> **O robô responde qualquer pergunta escrita?** `#perguntas-livres`
> Não. Ele entende as opções do menu. Quando alguém escreve uma pergunta fora do menu, ele responde com
> uma frase que a sua igreja escreveu e mostra a lista de novo — ou a pessoa pede para falar com alguém.
> Ele não tenta adivinhar.
>
> **Quanto tempo leva para entrar no ar?** `#prazo`
> A parte que depende de mim é rápida: o menu a gente monta numa conversa. A parte que não depende de
> mim é a verificação da igreja na Meta, que leva dias e é decidida por eles. Eu não vou te dar um prazo
> que não é meu para dar.
>
> **Quais igrejas já usam?** `#igrejas`
> Nenhuma, hoje. A plataforma está construída e testada, mas nada está no ar com membros reais. Se você
> perguntar isso de novo daqui a alguns meses, espero ter um pastor para você ligar. Hoje eu não tenho,
> e não vou inventar um.

**Visual**
Single-column accordion, all closed by default except the first. Question text must be large enough to
scan while closed — this is the section a treasurer reads. **Every question carries the anchor slug
shown after it** (`#nota-fiscal`, `#atraso`, `#equipe`…), so Rafael can send a church straight to one
answer inside a WhatsApp message. The slugs are part of the spec, not decoration — they must not be
renamed once a link has been sent.

> ⚠️ **`#preco`'s commercial terms are UNVERIFIED, exactly like `#fidelidade`.** "Mensalidade fixa por
> igreja, não por mensagem, não por membro, não sobe quando a igreja cresce, sem taxa de instalação" is
> nowhere in [[Decisions Log]] — it is a pricing *shape* only Rafael can set. No invented number appears,
> so the no-price rule holds; rule 7 does not. **Decide and record it before publishing**, or cut the
> sentence and leave only "o valor eu fecho na conversa".

> ⚠️ **"Tem fidelidade? Não. É mensal." is UNVERIFIED.** It is not in [[Decisions Log]] and it is not a
> code fact — it is a commercial policy only Rafael can set. **Rafael: decide this and record it in the
> Decisions Log before publishing.** If it is not decided by publication day, cut the question rather
> than soften it; a vague answer about contract terms is worse than no answer.

> ⚠️ Billing answers (`#pagamento`, `#atraso`) describe a **specced, unbuilt** subsystem ([[Whats Left]]
> — Stripe). Both now say so in their first clause. When Stripe ships, remove the disclaimers in the
> same commit that ships it.

---

## 13 — Rodapé

**Copy**

> Secretária Virtual — atendimento automático no WhatsApp para igrejas. Feito no Brasil, em português.
> [Política de Privacidade] · [Termos de Uso] · Falar com o Rafael: [WhatsApp]

**Visual**
Minimal. No fake social icons for accounts that do not exist. No "© 2026 Secretária Virtual Ltda." if
there is no Ltda.

> ⚠️ Both footer links must exist as real pages before publishing. A dead "Política de Privacidade" link
> on a page whose central argument is honesty about data is the single worst detail this page could ship.

---

## Fatos externos a verificar antes de publicar

Rule 7 of this page: an external fact carries a source URL and the date it was read, or it is marked
unverified here. **None of the seven below has a recorded source in this brain yet.** They are not
deleted, because each one is load-bearing — deleting them would hide the dependency.

| Claim on the page | Where | Status |
|---|---|---|
| Conversas iniciadas pelo membro não são cobradas pela Meta | §5 bloco 6, §6, §8 | **UNVERIFIED** — Meta has changed WhatsApp pricing before. Read Meta's WhatsApp pricing page, paste the URL and the date read here, and re-check before each publish. If it ever becomes paid, §5, §6 and §8 all change. |
| Um número na Cloud API para de funcionar no app do WhatsApp, para sempre | §7, FAQ `#atendimento` | **UNVERIFIED source**, though it is the basis of the whole chip decision ([[Decisions Log]]). Cite Meta's own documentation with URL + date. This is the page's most consequential factual claim. |
| A lista interativa do WhatsApp para em 10 linhas | §4, FAQ `#dez-assuntos` | **UNVERIFIED source** — enforced in code (`menu-admin-rules.ts`) and recorded in [[Menu Inventory]], but the number is Meta's. Cite the docs page with URL + date. |
| Verificação de negócio é exigida e leva dias | §3, §7, FAQ `#prazo` | **UNVERIFIED source** — recorded in [[Meta WhatsApp Setup]] from experience, not from a cited page. Cite Meta's business-verification docs with URL + date; never state a specific number of days. |
| A automação não oficial é o motivo *mais comum* de um número ser bloqueado | §5 bloco 6 | **UNVERIFIED** — added 2026-08-08. [[Decisions Log]] says Baileys violates WhatsApp's terms and can get a number banned, which supports "é um motivo", not "é o motivo mais comum". Either cite a source with URL + date, or narrow the copy to *"o motivo que eu vejo com mais frequência por aí"* — a statement about Rafael's observation, not about the world. |
| O chip precisa continuar ativo porque é nele que chega o código de confirmação | §7 | **UNVERIFIED** — added 2026-08-08 under Revisão 1 item 8. True of the registration/re-registration flow as Rafael understands it, never verified against Meta's own docs, and never actually performed (no Meta app exists — [[Whats Left]]). Cite the Cloud API number-registration docs with URL + date, **or** verify it in practice during the first real onboarding and record that instead. |
| Quem manda e recebe as mensagens é a Meta, não o chip — o robô não gasta o crédito | §7 | **UNVERIFIED** — added 2026-08-08. It follows from how the Cloud API works, but it is a promise about the church's phone bill and no source is recorded. Cite Meta's docs with URL + date, or soften to what is certain: as mensagens trafegam pela API da Meta, e a operadora quem sabe é ela. |

Pattern to copy: the nota fiscal spec, which sources every external assertion with a URL and a date read
and carries a staleness caveat. Do the same here before this page goes public.

No competitor is named anywhere on this page, and no competitor price appears. If one is ever added, it
carries a URL and the date read, in this table, with a staleness caveat — or it does not go on the page.

---

## What this page deliberately does not say

Kept here so a future edit does not "helpfully" add them back:

- No price, no "a partir de R$", and no guess at what a prepaid chip costs.
- No number of churches, hours saved, messages answered, or percentage of anything.
- No "conformidade com a LGPD", "seguro e em conformidade", "dados protegidos por lei".
- No "dízimo" — anywhere, in any inflection.
- No claim of notifications, alerts, monitoring, password reset or self-service password change, export
  or delete buttons, automatic data purge, working billing, submenus, or church offboarding.
- No "sem risco de banimento". Meta restricts numbers on its own criteria; the honest claim is narrower.
- No claim that the church holds or manages its own Meta credentials — Rafael operates them today.
- No promise of a live end-to-end bot demo until an outbound message has actually succeeded.
- No promise of support hours, SLA, or response time — including soft ones like "no mesmo dia".
- No polished mobile panel. The panel is usable on a phone (44px controls, nothing pushed off a 375px
  screen) and the page says exactly that much; the mobile *redesign* is requested and not started.
- No PIX for the church's own mensalidade, and no date for one.
- No menu that starts full of the church's own assuntos: a new church starts with the 🔒 Privacidade item
  alone, and the rest is written together.
- No logo wall, no "usado por", no invented pastor quote.
- No comparison table naming a competitor. Rafael would lose it: they have more features and
  published prices. The page competes on trust and channel, not on a checklist.

## Known weaknesses of this asset

- **The offer paragraph in §11 gives away the first months.** That is the right trade with zero social
  proof, but it means this page cannot also be the page that closes a paying church. When nota fiscal
  ships and there is one reference church, §11 gets rewritten and §12's "quais igrejas" answer changes.
  Those are the two sections with a known expiry date.
- **"Secretária virtual" is already in commercial use in Brazil** and is not a distinctive name. This
  page works with it because the buyer understands it instantly, but it is not defensible as a brand.
- **§10 promises a contract, a data statement and a credential-handover path that do not exist yet.**
  Blocker for publishing that section as written.
- **Every phone-screen visual depends on an outbound message that has never succeeded** ([[Whats Left]]).
  The page cannot ship real screenshots until the Meta app exists.
- **The page now confesses three unbuilt things in §8 (notificação, monitoramento, senha).** That is
  correct today and wrong the moment they ship. Whoever builds them edits §8, §6 and §12 in the same
  commit.
- **Seven external facts still have no source** — see the table above. Publishing before they are sourced
  breaks this page's own rule 7, on a page whose entire argument is that it does not overstate.
- **`#preco` and `#fidelidade` both rest on commercial terms Rafael has never recorded.** They are the
  only two answers on the page that no code and no note can settle.
- **The example menu in §4 is already full** (nine assuntos + Privacidade = 10). That is stated on the
  page on purpose, but it means the example cannot double as a "look how much fits" illustration — if a
  designer later adds a tenth visible row to the mock, the page contradicts itself.

---

## Revisões

**Revisão 1 — 2026-08-08.** Against `.superpowers/sdd/critique-mkt-landing.md`, with
[[Whats Left]] (2026-08-08) as the deciding source wherever the two disagreed.

**Blocking, closed**
1. *Selective honesty.* Added two admissions to §8 next to the existing notification one, plus a line in
   §6: **no monitoring or alerting** (the bot can die at 2am and nothing tells anyone) and **no password
   reset and no self-service password change** (a secretary who forgets hers messages Rafael, who runs a
   script by hand). Both are ❌-list items in [[Whats Left]]. §3 step 2 and FAQ `#textos` were reworded to
   "muda qualquer palavra **do robô** sozinha" so the self-service claim no longer collides with the
   password truth.
2. *Meta business verification was absent from the whole page.* Now in §3 step 1, in a dedicated half of
   §7, in a new FAQ `#prazo`, and in the external-facts table. It is Rafael's own current blocker, so the
   copy never implies speed and never gives a number of days.
3. *"Sem risco de banimento" cut.* [[Decisions Log]] claims no ban risk only *relative to Baileys*. §5
   block 6 now says the common cause of blocking (unofficial automation) is absent here, and states
   plainly that Meta decides restrictions and Rafael does not control that.

**High, closed**
4. *Billing described in present tense.* FAQ `#pagamento` and `#atraso` now open by saying the charge
   does not exist yet; Stripe is specced, not built ([[Whats Left]]). The hero honesty line, §11 and FAQ
   `#preco` say the same thing in the buyer's words: today there is no way to charge at all.
5. *"Credenciais próprias da sua igreja" fixed.* Per [[Multi-Tenancy]] and the code
   (`CredentialsForm.tsx` renders only "✓ Conectado"), the church sees a status indicator and nothing
   else. §5 block 6 now says the chip and number are the church's and that Rafael operates the access
   keys today, with the downside named.
6. *"Sem fidelidade" and instant revocation.* Split, because the critique was right about one and wrong
   about the other. **Fidelidade:** left in place and marked **UNVERIFIED** with an instruction for
   Rafael to decide and record it, rather than deleted — deleting it would hide a commercial decision the
   page depends on. **Revocation: the critique is wrong on the code.** `removeStaff` exists and is wired
   to a "Remover" button per row in `configuracoes/StaffManager.tsx`; `requireReadableSession()` in
   `src/lib/auth/writable.ts` re-reads the admin row on every protected page. So the panel *can* remove a
   staff user. What was inaccurate was "na mesma hora": access ends on that person's **next page load**,
   which is what [[Decisions Log]] says and what the guard does. FAQ `#equipe` now says exactly that.

**Medium, closed**
7. Free-pilot duration bound to a real event — free until billing and nota fiscal exist, which is both
   honest and the true answer to the treasurer's "e depois?".
8. §7 now answers the secretary's real questions: the church buys the chip, it stays in the church's
   name, any prepaid line works, it must stay active because the confirmation code arrives on it, and the
   bot does not consume its credit. **No price is invented** — the copy tells the reader to check with the
   operator, per the governing rule against invented prices.
9. Added §0 with `<title>`, meta description and OG copy for the WhatsApp link preview, keeping the
   "ainda não está no ar" clause inside `og:description`. Every FAQ question now carries a named anchor
   slug so `#nota-fiscal` can be sent tomorrow.
10. Added a production rule to §5: the flows described there are built but never driven by a human
    ([[Whats Left]] ⚠️ list). Drive them in a browser before publishing; if one breaks, the copy changes
    first.

**Portuguese, closed**
"responde as perguntas" → **"às perguntas"** (crase, hero sub and meta description); "pela quadragésima
vez" ×2 → **"pela milésima vez"**; "sem rodeio" → **"sem rodeios"**; "não é um chamado" replaced with
plain language ("não abre protocolo, não entra em fila"); "sistema de membresia" → **"sistema de
secretaria… não guarda rol de membros"**. "Você" kept throughout, per the critique.

**Found here, not in the critique**
- §9 said the isolation suite "roda a cada mudança no sistema", which reads as CI. **There is no CI in
  this repo** (no `.github/workflows`), so the claim was softened to what actually happens: Rafael runs
  the suite before publishing a change.
- §11 promised "eu te mostro o robô funcionando". **No outbound message has ever succeeded**
  ([[Whats Left]]), so a live demo cannot be promised. Now: he shows what exists.
- §10 promised "normalmente no mesmo dia", a response-time promise the page's own rules forbid. Removed.
- The **24h Meta reply window** was nowhere on the page. Combined with "no notification", it is a real
  daily constraint: a secretary who opens the inbox two days later is blocked from replying by Meta, and
  the panel says so in Portuguese (`caixa/actions.ts`). Added to §8 and FAQ `#atendimento`. This is a
  limitation, not a feature — it removes a surprise rather than adding a promise.
- Added a **Fatos externos a verificar** table and hard rule 7. Four Meta facts the page rests on have no
  cited source anywhere in this brain; all four are marked unverified with instructions to record URL +
  date, following the nota fiscal spec's pattern.

**Explicitly not done:** no new capability was promised anywhere in this pass. Every edit either removed
a claim, narrowed a claim to what the code does, or added a limitation. The only additions of new text
are §0 (meta/OG copy, which promises nothing), the anchor slugs, the external-facts table, and two FAQ
entries (`#prazo`, and the disclosure clauses) — all of which reduce what the page claims.

---

**Revisão 2 — 2026-08-08.** Against `.superpowers/sdd/recheck-mkt-landing.md`, with [[Whats Left]],
[[Decisions Log]] and [[Menu Inventory]] (all 2026-08-08) as the deciding sources. Two of the re-check's
four findings were accepted, one was accepted in part, one is **refuted** — and the two most important
problems on this page were in neither the critique nor the re-check.

**Found here, in neither review — the serious ones**
1. *§4's example menu was already full while the copy invited you to add to it.* The illustrated menu has
   nine assuntos; 🔒 Privacidade is a real `menu_item` row that counts against the same cap
   (`provisioning.ts` seeds it; `canActivateAnotherItem` in `menu-admin-rules.ts` counts active items
   against `WHATSAPP_LIST_MAX_ROWS`). Nine plus Privacidade is ten — the ceiling. So the page showed a
   full list and, in the paragraph directly above, promised a church could add its Ministério de Louvor
   to it. §4 now does the arithmetic out loud: a menu like the example is full, and something has to be
   hidden for something new to enter. **This is the same error family the sibling brand doc introduced
   ("a 10-row starting menu"), reached from the opposite direction.**
2. *§4 implied a church starts with that menu.* It does not. `provisionChurch()` seeds exactly one item,
   🔒 Privacidade ([[Whats Left]] ✅ list; [[Whats Left]] ❌ #5 describes the new admin landing on "a bare
   menu with one item"). The nine-item list is what a menu *becomes* after the §3 step 2 conversation,
   and §4 now says so. The [[Menu Inventory]] 9-row table is a v1 seed **spec**, not what the code plants.
3. *FAQ `#pagamento` contradicted the newest decision in [[Decisions Log]].* The card-only call of
   2026-08-07 was **reversed on 2026-08-08** — boleto alongside card, because many small churches have no
   card on the CNPJ and the pastor's-personal-card workaround recreates the exact mismatch the nota
   fiscal exists to prevent. The old copy still defended card-only as a deliberate choice. Rewritten to
   the current design, still opening with "não existe cobrança nenhuma construída", still refusing PIX
   without inventing a date. `#atraso` gained the cost that decision names: an unpaid boleto is not
   retried, so the dunning is Rafael noticing, not a machine.

**From the re-check — accepted**
4. *`#preco`'s commercial terms escaped the flag `#fidelidade` got* (re-check 3). Correct: "mensalidade
   fixa por igreja, não por mensagem, não por membro, sem taxa de instalação" is nowhere in
   [[Decisions Log]]. Flagged UNVERIFIED with the same instruction, not deleted — deleting it would hide
   a commercial decision the CTA depends on.
5. *Three unsourced external facts added by Revisão 1* (re-check 4). Correct, and it was a regression
   against rule 7 written in the same pass. The *Fatos externos* table went from four rows to seven: the
   chip receiving the confirmation code, the bot not consuming the chip's credit, and "unofficial
   automation is *the most common* cause of blocking" — that last one overstates what [[Decisions Log]]
   supports ("can get a number banned" ≠ "most common"), so the table carries a narrower fallback wording
   to use if no source is found. §7's own ⚠️ note now counts four, not two.

**From the re-check — accepted in part, and corrected**
6. *Mobile* (re-check 2). The re-check's evidence is **wrong**: it says `src/app/layout.tsx` exports no
   `viewport` so "a phone renders it at desktop width", but Next 15's App Router emits
   `width=device-width, initial-scale=1` by default when a route exports none, and this panel has since
   been worked specifically at phone width — `globals.css` defines `--tap: 44px` for every control and
   documents a measurement taken "at a real 375px viewport", with commits `52987b2` and `253b7fc` fixing
   the nav and the flex floor that pushed the page wider than the screen. The absence of `@media` is not
   evidence of a broken phone layout for a single-column panel. **But the conclusion survives its bad
   evidence:** [[Whats Left]] lists mobile polish as requested and not started, and `#celular`'s bare
   "abre no celular" let a pastor imagine a designed mobile app. `#celular` now says both halves — it
   works on a phone, it has not been redesigned for one. §3 step 2's "de um celular" stays: it is true.

**From the re-check — refuted**
7. *The blocking finding is out of date.* It claims §9's "por quanto tempo" advertises a member-facing
   promise the product breaks, citing `src/lib/church-defaults.ts:40` as saying *"as conversas são
   apagadas após 12 meses"*. **That sentence is gone.** The seed now reads *"enquanto a igreja precisar
   deles para te atender. Você pode pedir a exclusão a qualquer momento"*, above a comment that forbids
   restoring the 12-month wording until the purge ships, and [[Decisions Log]] records the removal on
   2026-08-08 ("The bot stopped promising a 12-month deletion it could not perform"). §9 was therefore
   accurate as written. Rather than change the claim, §9 now states *which* answer the Privacidade item
   gives, so the next reviewer can check it without opening the code, and a ⚠️ note records the refutation
   and forbids both restoring a retention period and deleting "por quanto tempo".

**Rule 2 check — did this pass add a promise while removing one?** No. Net capability change is negative:
§4 lost "your menu starts like this" and gained a ceiling that constrains the buyer; `#pagamento` lost a
payment method it never had and gained a "PIX não entra" with no date attached; `#celular` lost an
implied mobile app; `#preco` lost its unflagged authority. The only genuinely new assertion is boleto in
the *design*, which is sourced to [[Decisions Log]] 2026-08-08 and sits behind "não existe cobrança
nenhuma construída" in the same sentence — a description of a plan, not an offer.
