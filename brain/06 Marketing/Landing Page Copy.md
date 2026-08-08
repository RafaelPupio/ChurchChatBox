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
5. **No feature that isn't built** is described in the present tense. Not-built things are labelled
   *em construção* out loud (notifications, export/delete, nota fiscal).
6. **No price.** The CTA is a conversation, which is what makes the missing price survivable.

### The voice decision
The page is written in **Rafael's first person** ("eu"). With zero social proof, the only persuasion
currency available is a named human saying uncomfortable things out loud. A neutral corporate voice
would need proof this product does not have. Every "honest weakness" line on this page is doing the job
a testimonial would normally do — and it only works in first person.

---

## Page structure at a glance

| # | Section | Job | Scroll weight |
|---|---|---|---|
| 1 | Hero | One concrete scene + the promise | full viewport |
| 2 | O problema | Make them see their own Saturday night | short |
| 3 | Como funciona (3 passos) | Chip objection defused inside step 1 | medium |
| 4 | O que o robô responde | The menu, made tangible | medium |
| 5 | Recursos | 6 blocks, differentiators only | long |
| 6 | O que ele NÃO é | Kills wrong expectations before the demo | short |
| 7 | O chip novo | The hardest objection, its own section | medium |
| 8 | Perguntas difíceis | 4 objections, answered flat | medium |
| 9 | Dados dos membros | LGPD, said honestly | medium |
| 10 | Quem faz isso | Rafael, named, one person | short |
| 11 | As primeiras igrejas + CTA | The offer that replaces social proof | medium |
| 12 | FAQ | Commercial logistics | long, accordion |
| 13 | Rodapé | | short |

---

## 1 — Hero

**Job:** one specific scene, not a category description. The reader must recognise their own church in
the first line.

**Copy**

> **H1:** Sábado, 22h40. Alguém pergunta que horas é o culto de amanhã.
> Sua igreja responde na hora.
>
> **Sub:** Uma secretária virtual no WhatsApp que responde as perguntas de sempre — horários, endereço,
> agenda, ofertas, pedido de oração — com as palavras que a sua igreja escreveu. Sem aplicativo para o
> membro baixar. Sem inteligência artificial inventando nada.
>
> **CTA principal:** Quero conversar 20 minutos
> **CTA secundário:** Ver como funciona ↓
>
> **Linha de honestidade (logo abaixo dos botões, fonte menor):** Ainda não está no ar. Estou escolhendo
> as primeiras igrejas — e elas não pagam enquanto o produto estiver sendo ajustado com elas.

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

**Job:** end-to-end mental model in thirty seconds — and the chip objection lands in step 1, where it
cannot be accused of hiding.

**Copy**

> ## Como funciona
>
> **1. Um chip novo, só para o robô.**
> A igreja compra um chip pré-pago comum. O número que a igreja já usa continua funcionando exatamente
> como está — ninguém encosta nele. O robô ganha um número só dele, e eu explico o porquê disso mais
> abaixo, porque é importante e não é detalhe.
>
> **2. A gente monta o menu junto, com as palavras da sua igreja.**
> Numa conversa, eu pergunto os horários, o endereço, como se chamam os seus grupos, o que entra em
> Ofertas. Escrevo tudo no painel com você. Depois disso, qualquer pessoa da secretaria muda qualquer
> palavra sozinha, de um celular, sem me chamar.
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

---

## 4 — O que o robô responde

**Job:** make the menu concrete and simultaneously prove it is editable.

**Copy**

> ## O menu é seu — inclusive os nomes
>
> O robô responde uma lista de assuntos que a sua igreja define. Um menu comum começa assim:
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
> **Cabe até 10 assuntos.** Esse limite é do próprio WhatsApp, não meu — a lista que aparece para o
> membro é a lista nativa do aplicativo, e ela para em 10. Um desses lugares já é fixo: o item de
> Privacidade, que explica ao membro o que é guardado.

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
> Sem aplicativo para baixar. Sem cadastro. Sem senha para esquecer e recuperar. Ele já está no WhatsApp
> — é lá que ele pergunta. O irmão de setenta anos que usa WhatsApp e mais nada consegue usar isto na
> primeira tentativa, sem ninguém ensinar.

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

> ## Número oficial da Meta. Sem risco de banimento, sem custo por mensagem.
> Muita automação de WhatsApp por aí usa caminho não oficial, que é justamente o que faz um número ser
> bloqueado. Aqui é a API oficial da Meta, com credenciais próprias da sua igreja. E como o robô só
> responde quem falou com ele primeiro, a conversa é gratuita na Meta — o preço não sobe quando a sua
> congregação cresce.

**Visual**
Alternating image/text rows, 6 blocks. Only blocks 1, 4 and 5 need a visual, and all three should be
**real panel screenshots** (edit field, caixa de entrada, lista de pedidos com os selos novo/orado).
Blocks 2, 3 and 6 are text-only with a single line icon — resisting the urge to illustrate everything is
what keeps the page from looking like every other SaaS site.

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
> - **Não é sistema de membresia.** Não guarda cadastro de membro, nem frequência, nem célula.
> - **Não controla ofertas.** Ele mostra a chave PIX que vocês escreverem. Ele não recebe, não registra
>   e não soma nada.
> - **Não manda recado para a congregação.** O robô só responde quem falou com ele primeiro. Ele nunca
>   dispara mensagem para ninguém — e essa é justamente a razão de ele não custar por mensagem e nunca
>   parecer spam.
> - **Não substitui quem cuida do WhatsApp da igreja.** Tira dela a mesma pergunta pela quadragésima vez.
>   O que precisa de gente continua chegando em gente.

**Visual**
Plain list, no icons, no red X marks. Typographic restraint here reads as confidence. A monospace or
serif accent for this one section makes it feel like a note written by hand rather than a marketing grid.

---

## 7 — O chip novo

**Job:** the hardest objection in the sale ([[Decisions Log]], [[Meta WhatsApp Setup]]). Own section,
mid-page, said flatly. Framed as **protection**, not as cost.

**Copy**

> ## Sobre o chip novo, sem rodeio
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

---

## 8 — Perguntas difíceis

**Job:** answer the four objections that decide the sale, in the buyer's own words, before the FAQ.

**Copy**

> ## Perguntas difíceis, respondidas antes de você perguntar
>
> **"A gente já responde o WhatsApp. A irmã Cida cuida disso."**
> Ótimo — e ela continua cuidando. Isto não tira a Cida do WhatsApp. Tira dela responder "o culto é 19h"
> pela quadragésima vez, e faz o visitante de sábado à noite não ficar sem resposta até segunda. O que
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

**Visual**
Q&A blocks, question in bold at a larger size, answer in body. No accordions here — these must be
readable without a click. The notification admission gets a subtle left border in a neutral tone so a
skimmer's eye lands on it. Do not hide the weakest answer; a reader who finds it *after* deciding will
distrust everything above it.

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
> site — está na mesma lista dos horários de culto.
>
> **Uma igreja nunca enxerga os dados de outra.** Isso não é promessa: é uma bateria de testes
> automáticos que tenta, de propósito, ler os dados de uma igreja usando a identidade de outra, e
> verifica que não vem nada. Roda a cada mudança no sistema. Eu prefiro te mostrar um teste que ataca o
> sistema do que te dar a minha palavra.
>
> **A igreja é a dona dos dados dos seus membros.** Quem responde ao membro é a igreja, e é a igreja
> quem manda no que está guardado. Eu opero o sistema para vocês.
>
> **O que ainda não existe, e você precisa saber antes:** os botões de exportar e de apagar os dados a
> pedido de um membro, e a limpeza automática das conversas antigas. Está tudo desenhado e é o próximo
> bloco de trabalho — mas hoje ainda não está pronto, e enquanto não estiver, esses pedidos passam por
> mim, na mão.
>
> Uma observação que o advogado da sua congregação vai fazer, então faço eu: a lista de quem frequenta
> uma igreja revela convicção religiosa, o que a LGPD trata como **dado sensível**. É por isso que este
> assunto ganhou uma seção inteira nesta página em vez de uma linha no rodapé.

**Visual**
Single column, narrower measure than the rest of the page (~60ch), no icons, no shield graphics, no
padlock illustrations. Security iconography reads as marketing here and undercuts the one section whose
entire value is that it does not sound like marketing. Plain text, generous line height.

---

## 10 — Quem faz isso

**Copy**

> ## Quem está do outro lado
>
> Sou o Rafael. Sou uma pessoa só — não tem equipe, não tem central de atendimento, não tem robô de
> suporte. Isso tem um lado bom e um lado ruim, e você merece os dois.
>
> **O lado bom:** você fala direto com quem construiu. Mudar uma palavra é uma mensagem, não um chamado.
> Quando você pedir alguma coisa, quem decide sou eu, e normalmente no mesmo dia.
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
> paragraph's specifics down to what is actually true on publication day.

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
> pagam enquanto a gente estiver ajustando o produto junto**. Em troca, eu quero o que dinheiro não
> compra — vocês usando de verdade, achando os defeitos e me dizendo o que falta. Eu monto o menu, eu
> configuro o número, eu acompanho as primeiras semanas de perto.
>
> Se isso funcionar na sua igreja, você vai ser a igreja para a qual a próxima vai ligar.
>
> **[ Quero conversar 20 minutos ]**
>
> Vinte minutos, no seu WhatsApp ou numa chamada. Eu te mostro o robô funcionando, você me diz o que a
> sua igreja pergunta o dia inteiro, e a gente decide junto se faz sentido. Se não fizer, eu falo.

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

---

## 12 — FAQ

**Job:** the treasurer's questions. Accordion; every answer complete enough to be forwarded to a
treasurer without Rafael in the thread.

**Copy**

> ## Perguntas frequentes
>
> **Quanto custa?**
> Uma mensalidade fixa por igreja. Não é por mensagem, não é por membro, e não sobe quando a igreja
> cresce. Não tem taxa de instalação. O valor eu fecho na conversa — e, para as primeiras igrejas, ele é
> zero enquanto durar o acompanhamento. Uma referência honesta para você comparar: pense no que a igreja
> paga hoje ao escritório de contabilidade, não no preço de um sistema de gestão inteiro. Isto aqui é
> uma peça, não é o sistema todo.
>
> **Tem fidelidade? Contrato de 12 meses?**
> Não. É mensal. Se parar de fazer sentido, você para.
>
> **Como se paga?**
> Cartão. Sei que a maioria das igrejas prefere PIX ou boleto, e essa é uma escolha que eu fiz para o
> serviço se manter sozinho, sem ninguém precisar lembrar de pagar todo mês. Se a sua tesouraria só
> trabalha com PIX ou boleto, me fala na conversa — prefiro saber disso no começo. Não vou fingir que
> não é um incômodo.
>
> **Vocês emitem nota fiscal? Meu contador vai pedir.**
> Ainda não, e sei exatamente o que isso significa: sem nota, a sua tesouraria não consegue lançar a
> despesa, e a conversa morre no contador por mais que o pastor tenha gostado. A emissão está sendo
> construída agora. É por isso que as primeiras igrejas entram sem pagar — não existe cobrança, então
> não existe nota a emitir. Quando a cobrança começar, a nota começa junto.
>
> **E se a igreja atrasar o pagamento?**
> O robô não desliga no mesmo dia. São sete dias de prazo. Depois disso ele fica em silêncio — mas
> **nada é apagado**: as mensagens continuam sendo registradas, o painel continua legível, e no dia em
> que o pagamento entrar volta tudo exatamente como estava, com a caixa de entrada certa. Você nunca
> perde o que escreveu.
>
> **Precisa de computador? A secretária consegue usar pelo celular?**
> O painel abre no navegador, no celular ou no computador. Não instala nada.
>
> **Quantas pessoas da igreja podem usar o painel?**
> Quantas vocês quiserem. Cada uma com o login dela. Quando alguém sai da equipe, o acesso dela cai na
> mesma hora — não fica valendo até o fim do dia.
>
> **A gente consegue mudar os textos sozinho depois?**
> Consegue tudo. Horários, endereço, os nomes dos grupos, a saudação, até a frase que o robô diz quando
> não entende. Essa é a ideia inteira do produto: você não fica dependendo de mim para trocar o horário
> do culto de domingo.
>
> **E se a gente quiser mais de dez assuntos no menu?**
> O limite de dez é do WhatsApp, não meu. Quando uma igreja chegar perto disso, a saída são submenus —
> "Grupos" abrindo uma segunda lista. Ainda não construí, porque nenhuma igreja chegou lá. Quando
> chegar, a gente resolve.
>
> **Dá para atender por esse número pelo celular, como a gente faz hoje?**
> Não. Um número da API oficial não abre no aplicativo do WhatsApp — é a mesma razão pela qual ele
> precisa ser um chip novo. O atendimento humano acontece no painel, pelo navegador. É diferente do que
> a sua equipe faz hoje e vale você saber disso antes.
>
> **O robô responde qualquer pergunta escrita?**
> Não. Ele entende as opções do menu. Quando alguém escreve uma pergunta fora do menu, ele responde com
> uma frase que a sua igreja escreveu e mostra a lista de novo — ou a pessoa pede para falar com alguém.
> Ele não tenta adivinhar.
>
> **Quais igrejas já usam?**
> Nenhuma, hoje. Está tudo construído e testado, mas nada está no ar com membros reais. Se você
> perguntar isso de novo daqui a alguns meses, espero ter um pastor para você ligar. Hoje eu não tenho,
> e não vou inventar um.

**Visual**
Single-column accordion, all closed by default except the first. Question text must be large enough to
scan while closed — this is the section a treasurer reads. Keep an anchor link per question so Rafael
can send a church straight to "Nota fiscal" or "Chip novo" in a WhatsApp message.

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

## What this page deliberately does not say

Kept here so a future edit does not "helpfully" add them back:

- No price, no "a partir de R$".
- No number of churches, hours saved, messages answered, or percentage of anything.
- No "conformidade com a LGPD", "seguro e em conformidade", "dados protegidos por lei".
- No "dízimo" — anywhere, in any inflection.
- No claim of notifications, alerts, export or delete buttons, or automatic data purge.
- No promise of support hours, SLA, or response time.
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
