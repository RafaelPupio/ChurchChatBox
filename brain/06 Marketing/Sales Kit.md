# Sales Kit

The kit Rafael actually opens during a real conversation with a pastor: the message to send, the demo to run, the answers to the ten questions that always come, what to promise on onboarding, and how to say no.

Strategy notes here are English. **Everything a church reads or hears is pt-BR and is meant to be used verbatim** — WhatsApp copy sits in code blocks so the `*negrito*` survives a copy-paste; spoken lines sit in quote blocks.

Related: [[Overview]] · [[Whats Left]] · [[Decisions Log]] · [[Bot Flow]] · [[Menu Inventory]] · [[Launch Checklist]] · [[Multi-Tenancy]] · [[Backlog]]

---

## 0 · Read this before using any of it

This kit describes the product as it is in [[Whats Left]], not as it will be. **Six facts gate a paid sale today:**

| Gate | Consequence for a real conversation |
|---|---|
| **No outbound message has ever succeeded** — needs a Meta app + test number | There is no demo yet. The demo script below is unrunnable until stage 8 of [[Launch Roadmap]]. |
| **Meta business verification not done** — "takes days, may request documents; **CNPJ helps**" ([[Meta WhatsApp Setup]]) | Onboarding cannot finish on a real chip no matter what the pastor agrees to, and the delay is not Rafael's to shorten. |
| **No nota fiscal** | A church with CNPJ and contador cannot pay. Don't quote them; waitlist them. |
| **No billing of any kind** — Stripe is *specced, ready to plan, not built* ([[Whats Left]]) | There is no way to charge anybody today, and **no grace period, no automatic suspension and no automatic reactivation exist**. Card 4.6 is unusable until it ships. |
| **No notification of any kind** | "Falar com Atendente" only works if a named human opens the panel. Sell the discipline honestly or don't sell it. |
| **No password reset, and staff cannot change their own password** | The onboarding promise below must not say "depois vocês trocam a senha". It isn't true yet. |

And one softer fact that shapes every sentence below: **everything in the panel half of the product is built but has never been driven in a browser by a human** — inbox, prayer list, menu editing, image upload ([[Whats Left]], "Built, but never exercised"). It is written and typechecked, not exercised. Describe it in the present tense only after Rafael has done it himself once.

Until those clear, the only honest sale is **church #1 as a free pilot** — Rafael's own church or a pastor friend's — run for months to earn one phone number a stranger can call for a reference. Everything in this kit is written for that conversation first.

**Precedence:** where this kit, a review, or memory disagree, [[Whats Left]] and the code win. §8 records the places where that happened.

---

## 1 · Disqualify early — the questions to ask in the first ten minutes

A bad-fit church costs 2–6 weeks and ends at the tesoureiro. Ask these *before* demoing. Any two reds and the honest move is to say so and walk.

| Ask (pt-BR) | 🟢 Good answer | 🔴 Walk away |
|---|---|---|
| "Quantas mensagens a igreja recebe no WhatsApp numa semana normal?" | Dezenas, e cresce em semana de evento | "Umas cinco" → o status quo está certo |
| "Quem responde hoje, e em quanto tempo?" | Uma pessoa, sobrecarregada, ou demora até segunda | Responde em 5 minutos, sempre |
| "Quem vai abrir o painel toda semana? Tem nome?" | Um nome e sobrenome, presente na conversa | "A gente vê depois" → a caixa de entrada morre |
| "A igreja topa comprar um chip novo e divulgar um segundo número?" | Sim, sem drama | Hesitação → é um não educado |
| "A igreja tem CNPJ e contador?" | Com CNPJ e **sem** contador exigente → é o perfil menos travado que existe hoje | Com contador → **bloqueado até a nota fiscal existir** |
| "Quem paga as contas, e a igreja tem cartão de crédito no CNPJ?" | Tem cartão, e o tesoureiro usa | Só boleto e PIX → provavelmente perdido hoje |
| "Quem decide isso? Precisa passar por conselho ou assembleia?" | O pastor decide | Assembleia anual → ciclo longo, agende para o orçamento |
| "A sede da denominação já contratou alguma plataforma?" | Não / cada congregação decide | Sede já assinou → porta fechada, não insista |

**A igreja sem CNPJ não é um 🟢.** É um **piloto que provavelmente nunca vira cliente**, e Rafael precisa saber disso antes de investir semanas. Dois motivos, os dois fora do controle dele: a verificação de negócio da Meta "pode pedir documento; **CNPJ ajuda**" ([[Meta WhatsApp Setup]]), então sem CNPJ o número de produção pode simplesmente não sair; e sem CNPJ não há a quem emitir nota nem de quem cobrar depois. Pilote com ela se ela for a igreja disponível — mas registre como piloto, não como funil.

One more that is timing, not fit: **"quando a igreja aprova o orçamento?"** diz em que mês a conversa realmente pode fechar. *(A crença de que **janeiro, fevereiro e julho** são os meses de caixa apertado da igreja brasileira é **não verificada** — não há fonte nenhuma no brain. Ver §8.1: confirmar com dois tesoureiros antes de planejar um calendário comercial em cima dela.)*

**The green-light profile:** 150–600 membros, WhatsApp que já transborda, uma voluntária cansada com nome próprio, pastor que decide sozinho, CNPJ, e disposição para ser piloto.

---

## 2 · The pitch to send on WhatsApp

Two messages, not one. The first is short enough to read while walking. The second only goes out **if he asks**.

### 2.1 · Abertura (depois de uma indicação)

```text
Pastor [Nome], tudo bem? Aqui é o Rafael — foi o [Nome de quem indicou] que me
passou o seu contato.

Eu construí uma secretária virtual de WhatsApp para igreja. Em uma frase: é um
número da igreja que responde sozinho as perguntas de sempre — horário de culto,
endereço, agenda, o calendário do mês — e, quando a pessoa quer falar com gente,
ele se cala, e a conversa fica esperando numa caixa de entrada que a secretaria
abre.

Quem escreve as respostas é a própria igreja, num painel em português. Não é
aplicativo, ninguém precisa instalar nada.

Posso mostrar em 10 minutos, por vídeo ou aí na igreja. O que for melhor para o
senhor?
```

*(Sem indicação, troque a primeira frase por: "Aqui é o Rafael, eu [como nos conhecemos — vi a página da igreja no Instagram / a gente se conheceu no ...]". Nunca deixe o colchete cru na mensagem enviada.)*

### 2.2 · A página única (só quando ele pedir detalhes)

```text
🙏 *Secretária Virtual*
O WhatsApp da igreja respondendo sozinho, 24 horas.

*Como funciona*
O membro manda mensagem para o número da igreja e recebe um menu para tocar.
O menu é montado com a igreja — por exemplo:
⛪ Horários de Culto
📍 Endereço e Contato
📅 Agenda de Eventos
🗓️ Calendário do Mês (imagem)
🔥 [nome do grupo de jovens] · 👥 [nome do grupo de adultos]
💚 Ofertas
🙏 Pedido de Oração
💬 Falar com Atendente

*Quem escreve tudo isso é a igreja*
Cada palavra — a saudação, o horário, o endereço, até a frase de quando o robô
não entende — a secretária edita num painel em português. Sem chamar técnico.

*Quando alguém pede uma pessoa*
O robô se cala para aquele contato — ele nunca atrapalha uma conversa pastoral
— e a conversa fica esperando numa caixa de entrada, de onde a secretaria
responde pelo mesmo número da igreja.

*Pedido de oração vira item de lista*
Entra numa lista com "novo" e "orado", em vez de ficar no meio das mensagens.

*Três coisas que o senhor precisa saber antes de gostar*
1) Precisa de um *chip novo*. Um número ligado à API oficial da Meta para de
funcionar no aplicativo do WhatsApp para sempre. Por isso o número atual da
igreja continua exatamente como está — ninguém mexe nele.
2) Ele *não envia avisos* para a congregação. Só responde quem chamou primeiro.
É de propósito: é por isso que ele nunca vai parecer spam.
3) Ele *não avisa ninguém* quando um membro pede para falar com uma pessoa. A
conversa fica esperando no painel, e alguém da equipe precisa abrir o painel.
Não chega e-mail, não toca nada no celular. Prefiro o senhor saber disso agora.

*O que ele não é*
Não é aplicativo para baixar, não é sistema de membresia, não controla ofertas
(só mostra o que a igreja escreveu) e não tem inteligência artificial — ele só
diz o que a igreja escreveu, e é assim que a gente quer.

Se fizer sentido, me chama que eu mostro funcionando.
```

**Rules for this copy:** todas as proibições do §7 valem aqui, palavra por palavra — em especial a do item 7.1, nenhum preço, nenhuma "igreja que já usa", e nunca "está de acordo com a LGPD".

**On the menu list above:** it is an *example*, deliberately. A church created by `provisionChurch()` starts with **one** menu row, 🔒 Privacidade — the nine items above are a local development fixture (`src/db/seed.ts`, guarded by `NODE_ENV`, "never run this against production"), not what a real church gets. Rafael types the church's items into the panel by hand. See §5 and §8.2.

---

## 3 · The demo script

**Precondition:** a live number and a church with real content. Until Meta is wired ([[Meta WhatsApp Setup]]), do not improvise a demo from screenshots — a fake demo is the fastest way to lose a pastor who then messages the number.

**Second precondition, and it is the real one:** minutes 6, 7 and 8 drive the Caixa de Entrada, os Pedidos de Oração and menu editing, and **none of the three has ever been used by a human in a browser** ([[Whats Left]], "Built, but never exercised"). Rafael runs this entire script alone, end to end, before he runs it in front of a pastor. A screen that breaks live costs more than the meeting.

Twelve minutes. **Start on the phone, end in the panel.** The order matters: he has to feel it as a member before he evaluates it as a buyer.

**Minute 0 — o chip, antes de qualquer coisa.** Levante você, nunca ele.
> "Antes de eu mostrar: isso mora num chip novo, não no número que a igreja já usa. O número de vocês continua igual, ninguém mexe. Eu explico o porquê depois de o senhor ver funcionando."

**Minute 1 — dê o telefone para ele.** Não narre. Deixe ele tocar sozinho no menu.
> "Manda um 'oi' aí."

**Minute 2 — ⛪ Horários.** Ele toca, a resposta chega. Pergunte, não afirme — o número tem que sair da boca dele, e Rafael não tem nenhum dado sobre a igreja dele.
> "Quantas vezes por semana a irmã que cuida do WhatsApp responde essa mesma pergunta?"

**Minute 3 — 🗓️ Calendário do Mês.** A imagem chega no celular dele.
> "A secretária sobe essa imagem uma vez por mês. É o mesmo arquivo que ela já manda no grupo."

**Minute 4 — 🙏 Pedido de Oração.** Peça que ele escreva um pedido de verdade, curto. Mostre o "Recebemos seu pedido".

**Minute 5 — 💬 Falar com Atendente.** Ele toca. Nada acontece no telefone dele — e é esse o ponto.
> "Reparou que o robô parou? Ele fica mudo para essa pessoa. Robô interrompendo conversa pastoral é a pior coisa que podia acontecer, então ele simplesmente sai."

**Minute 6 — abra o painel: Caixa de Entrada.** A conversa dele está lá. Responda pelo painel. A resposta chega no telefone dele, **pelo número da igreja**. Clique em "Encerrar atendimento". Diga a parte incômoda enquanto ele ainda está olhando para a tela:
> "Repare uma coisa: eu abri o painel porque eu sabia que a mensagem estava aqui. Não chegou aviso nenhum para mim — nem e-mail, nem notificação. Hoje é assim, e é por isso que eu vou insistir em saber o nome de quem abre isso."

**Minute 7 — Pedidos de Oração.** O pedido dele está na lista, marcado como "novo". Marque como "orado".
> "Isso aqui é uma lista de oração, não um chamado de suporte. É o único jeito que faz sentido para igreja."

**Minute 8 — Conteúdo. Este é o minuto que vende.** Mude o horário do culto na frente dele e peça que ele toque de novo no menu.
> "Agora o robô fala com as suas palavras. Quem muda isso é a sua secretária, do celular dela, sem me ligar."

**Minute 9 — mostre a falha de propósito.** Peça que ele digite algo fora do menu: *"vocês têm estacionamento?"*
> "Ele não chuta. Ele devolve o menu, e essa frase de 'não entendi' também é editável — se o senhor quiser que ela diga 'me manda um oi que a Cida te responde amanhã', ela diz."

Mostrar a fraqueza você mesmo custa trinta segundos e compra a credibilidade do resto da conversa.

**Minute 10 — Configurações.** Mostre o indicador "Conectado" e o fato de que a igreja **não** vê as credenciais da Meta.

**Minutes 11–12 — não fale de preço.** Termine com as perguntas da seção 1 que ainda faltarem, principalmente esta:
> "Se um membro pedir para falar com uma pessoa numa quarta às 21h, quem é que abre esse painel? Quero um nome."

---

## 4 · Objection cards

Each card: what he says, what Rafael says (verbatim pt-BR), and **where the answer is weak** — the weakness note is for Rafael's eyes only, and exists so he never oversells a line he can't defend.

### 4.1 · "A gente já responde o WhatsApp — a irmã Cida cuida disso."
> "Não é para tirar a irmã Cida do WhatsApp. É para ela não responder 'o culto é às 19h' pela milésima vez, e para o visitante de sábado à noite não ficar sem resposta até segunda. O que precisa de gente continua chegando em gente — é isso que o 'Falar com Atendente' faz."

Cite três casos concretos, nunca genéricos: a mensagem de sábado 22h40; o visitante que achou a igreja no Instagram; a mãe perguntando se o [grupo de jovens] tem reunião essa semana.

*Weak because:* numa igreja de 80 pessoas onde a Cida responde em cinco minutos, o status quo está **correto** — desqualifique em vez de brigar. Pior: o chip novo faz a igreja passar a ter dois números e um painel a conferir, então para a igreja pequena o produto **acrescenta** uma peça móvel antes de tirar qualquer uma.

### 4.2 · "Vocês colocam o robô no número que a gente já usa?"
> "Precisa de um chip novo. O número da igreja continua funcionando exatamente como está — ninguém mexe nele. O robô ganha um número só dele. E é importante o senhor entender o porquê: um número ligado à API oficial da Meta para de funcionar no aplicativo do WhatsApp para sempre, e o histórico de conversas não vai junto. Por isso ninguém, nunca, coloca o número principal da igreja nisso."

Enquadre como **proteção, não custo**, e chegue com o plano de divulgação pronto: bio do Instagram, boletim, slide antes do culto, cartãozinho impresso. Custo real: um chip pré-pago. Ver [[Meta WhatsApp Setup]].

*Weak because:* número novo tem zero reputação — leva meses para os membros usarem, e a igreja pode concluir que "não funcionou" quando o que falhou foi adoção. E o atendimento humano cai num navegador, não no celular da Cida. Isso não some; o enquadramento honesto é "um número para informação, outro para pessoas".

### 4.3 · "Dá para mandar um aviso para todo mundo?"
> "Não manda. O robô só responde quem falou com ele primeiro. É exatamente por isso que ele não tem custo por mensagem na Meta, e é por isso que ele nunca vai parecer spam."

*Weak because:* isto é o que o pastor realmente queria, e o pastor é quem compra. Concorrentes vendem broadcast como manchete. Não há resposta de roadmap para dar — [[Backlog]] arquiva broadcasts em "considerado e parado". Espere perder alguns negócios aqui.

### 4.4 · "Tem inteligência artificial? Eu vi um por aí que tem."
> "Não tem IA, e isso é de propósito. O robô só fala o que a igreja escreveu. Ele não vai inventar doutrina, não vai dar conselho pastoral, não vai errar um horário. Se ele não entende, ele não chuta: oferece o menu ou passa para uma pessoa. E como não tem IA, não tem custo de IA por mensagem — nem para mim, nem repassado para o senhor."

*Weak because:* "sem IA" lê-se como "menos produto" em comparação de lista de recursos. E é frágil no mérito: membros digitam texto livre, e toda mensagem não reconhecida recebe o mesmo fallback + menu, com teto de 10 itens ativos ([[Menu Inventory]]). O próprio [[Backlog]] diz que esse é o sinal que justificaria revisitar IA.

*Cut on this pass:* a frase "o preço não sobe quando a igreja cresce" era uma promessa sobre uma estrutura de preço **que não foi decidida** ([[Decisions Log]] não registra preço nenhum). O que sobrou é um fato de custo, não um compromisso de preço. **Não reintroduza.** E o "concorrente anunciando IA por R$ 19,90" saiu do argumento e virou uma hipótese a checar — §8.1.

### 4.5 · "Quando alguém pedir para falar com uma pessoa, como a gente fica sabendo?"
> "A conversa aparece na Caixa de Entrada do painel e o robô fica mudo para aquela pessoa. A equipe responde pelo painel, saindo pelo mesmo número da igreja, e clica em 'Encerrar atendimento' quando termina. Se ninguém encostar em 24 horas, o contato volta para o robô em vez de ficar preso no silêncio. Vou ser direto com o senhor: hoje não existe notificação — nem e-mail, nem alerta. Alguém da equipe precisa abrir o painel, e por isso eu quero saber quem é essa pessoa antes de a gente começar."

*Weak because:* **o buraco operacional mais sério do produto.** O fracasso realista: o membro toca às 21h de quarta, o robô emudece, ninguém abre o painel até domingo, e a experiência é que a igreja o ignorou — pior do que não ter bot nenhum. Hoje Rafael vende uma **disciplina**, não um mecanismo, e disciplina de voluntário é exatamente o que falha. Trate notificação como bloqueador de lançamento, não item de lista de desejos. Segundo ponto mole: o retorno automático em 24h **está escrito e nunca rodou** ([[Whats Left]]: a janela de 24h e o fluxo de handoff estão em "built, but never exercised"). Rafael testa isso sozinho antes de dizer a frase; se ainda não testou, corte a sentença das 24 horas em vez de apostar nela.

### 4.6 · "Quanto custa? E é todo mês?"

> ⛔ **Este card está travado.** Não há cobrança de espécie alguma construída: Stripe está em *"Specced, ready to plan, not built"* ([[Whats Left]]). O prazo de sete dias, a suspensão automática e a reativação existem como **decisão e como coluna no banco**, não como comportamento — nada move uma igreja para `past_due`, porque nada cobra ninguém. Descrever isso como "o jeito que a cobrança funciona" é descrever um sistema que não existe. E o preço em si também não está definido ([[Decisions Log]] não registra nenhum).

Enquanto isso, a resposta honesta é curta, e é a única aprovada:
> "Ainda não vou cobrar do senhor. Estou colocando as primeiras igrejas no ar sem cobrança, porque eu ainda estou terminando a parte de pagamento e a nota fiscal. Quando isso existir, eu venho com o preço e com a nota na mão, e o senhor decide aí. O que eu não vou fazer é cobrar antes de conseguir emitir a nota."

Se ele insistir no número, ancore contra o que a igreja já paga — a mensalidade do contador, a conta de luz do salão, uma hora de trabalho de alguém por semana — mas **não invente um número**, nem uma estrutura ("mensalidade fixa", "sem taxa de instalação"): nada disso foi decidido.

*Weak because:* a âncora do mercado já foi fincada por outros, e a economia unitária de um operador solo não fecha em preço baixo. Isto precisa ser resolvido **antes** da primeira proposta, não durante. E "de graça por enquanto" é confortável demais: é fácil deixar correr por um ano e nunca ter a conversa de preço.

### 4.7 · "Como a gente paga? Manda o boleto, ou a gente faz PIX."
> "Vai ser cartão. Eu sei que igreja prefere PIX, e eu vou ser franco: essa escolha é minha, e ela é mais confortável para mim do que para vocês. O cartão é o que me deixa tocar isso sozinho, sem ficar conferindo comprovante um a um. Ainda não está construído — quando estiver, é cartão."

*Weak because:* aqui o produto está genuinamente desalinhado com o comprador e Rafael deve **esperar perder negócios**, não argumentar. Muitas igrejas não têm cartão no CNPJ. O atalho que todo mundo propõe — cartão pessoal do pastor — cria exatamente o problema que a nota fiscal existe para resolver: documento no CNPJ, dinheiro saindo de pessoa física. O [[Decisions Log]] já registra o gatilho de revisão ("a primeira igreja que se recusar"); essa igreja provavelmente é a primeira ou a segunda. Nomeie a assimetria: essa decisão otimiza para o fornecedor. *(Ironia a não deixar passar: o menu 💚 Ofertas mostra a chave PIX da igreja — o produto exibe PIX e não aceita PIX.)*

### 4.8 · "Você emite nota fiscal? Meu contador vai pedir."
> "Hoje não. Está sendo construído. Enquanto não existir, eu não vou cobrar de uma igreja que precisa de nota — não seria honesto. O que eu posso fazer agora é rodar com vocês como piloto, sem cobrança, e voltar com a nota quando ela existir."

*Weak because:* não é objeção, é **portão**. E o portão está mais longe do que parece: quatro experimentos contra homologação antes de qualquer código, dependência de o município de Rafael ser atendido, custo fixo mensal do emissor que chega antes da primeira nota, CNPJ próprio com o CNAE certo e certificado A1. Qualquer conversa que chegue no tesoureiro antes disso termina em "volte quando tiver nota".

### 4.9 · "E os dados dos membros? E essa lei de proteção de dados?"
> "Eu não vou dizer para o senhor que o sistema 'é compatível com a LGPD' — isso é uma afirmação jurídica, e software nenhum garante isso. Eu digo o que ele faz. Ele guarda o número de WhatsApp do membro, as mensagens daquela conversa, e o pedido de oração se ele enviar. Tem um item 🔒 Privacidade no menu que conta isso ao membro em português, incluindo por quanto tempo e com quem falar. Cada igreja enxerga só os dados dela, e esse isolamento é testado por uma suíte que ataca o próprio sistema. E a igreja é a controladora desses dados — não eu."

*Weak because:* três pontos moles reais. (a) As ferramentas do Art. 18 não existem ainda, e o texto de Privacidade **já promete** ao membro o apagamento em 12 meses — lacuna viva entre o que o bot diz e o que o sistema faz. (b) Rafael segura as credenciais Meta e tecnicamente consegue ler a caixa de entrada de qualquer igreja: isso é relação de operador e pede contrato escrito. (c) "Isolamento provado" significa provado em teste ([[Multi-Tenancy]]), não em produção com tráfego real. Um advogado da congregação — e igreja tem — empurra em qualquer um dos três. **Não blefe em nenhum.**

### 4.10 · "E se acontecer alguma coisa com você? Quem cuida disso depois?"
> "É uma pessoa só, sou eu. O que reduz o risco: o conteúdo é de vocês, nada fica preso num formato que só eu leio, e o chip é da igreja. O que eu vou entregar ao senhor por escrito é quem procurar, o que acontece com os dados, e como a igreja recebe as credenciais do próprio número se eu parar de operar."

⚠️ **Não diga a última frase antes de o documento existir.** Ela é um compromisso, não um argumento; dita sem o papel pronto, é exatamente o tipo de promessa que este kit existe para impedir.

*Weak because:* a mitigação é mais fina do que soa. Rafael segura as credenciais da Meta por design, então uma igreja abandonada fica com um número amarrado a uma conta Cloud API que ela não controla — desamarrar é um processo de suporte da Meta, não um botão. Não há SLA, horário de atendimento, segunda pessoa, escrow nem contrato. **Escreva o contrato simples e a saída documentada antes de dizer essa frase**, ou ela vira promessa vazia.

### 4.11 · "Quais igrejas já usam? Posso falar com o pastor de uma delas?"
> "Nenhuma. Nada está no ar ainda, e eu não vou inventar cliente para o senhor. O que eu ofereço é o contrário disso: as primeiras igrejas moldam o produto e têm a minha atenção inteira, em troca de serem quem encontra os defeitos."

*Weak because:* posição genuinamente fraca — igreja compra por indicação, e o risco de constrangimento do pastor diante da congregação é alto. Colide com um fato duro: a primeira igreja é literalmente o primeiro teste do sistema. A mitigação não é retórica, é operacional: **rode a igreja #1 de graça, por meses, até existir um telefone que se possa ligar.**

---

## 5 · The onboarding promise

Say exactly this, and nothing more generous.

### O que a igreja faz
1. **Compra um chip novo** e escolhe o número (pré-pago serve).
2. **Dá um nome** — quem é a pessoa que abre o painel. Sem esse nome, não comece.
3. **Escreve o conteúdo**: horários, endereço, agenda, os grupos da igreja com os nomes que a igreja usa, e a chave PIX das Ofertas. Rafael pode montar um primeiro rascunho a partir do que a igreja já tem no Instagram e no boletim, mas a igreja revisa cada palavra.
4. **Sobe o calendário do mês** — uma imagem, uma vez por mês.
5. **Divulga o número**: bio do Instagram, boletim, slide antes do culto, cartãozinho.

### O que Rafael faz
Cria a igreja no console, conecta as credenciais da Meta, aponta o webhook, **digita item por item o menu da igreja no painel**, faz um teste de ponta a ponta, e senta uma vez com a secretária para ela mexer no painel com as próprias mãos. A igreja nunca vê nem toca em credencial — só um indicador "Conectado". Ver [[Launch Checklist]].

⚠️ **Duas coisas que "montar o menu" esconde, e que são de Rafael, não da igreja.**
- Uma igreja nova nasce com **um** item, 🔒 Privacidade — `provisionChurch()` cria a igreja, o admin e esse item, e mais nada. Os outros são trabalho manual de Rafael no painel, e **a edição de menu nunca foi usada num navegador** ([[Whats Left]]). Ele descobre quanto tempo isso leva na igreja #1, não antes.
- **O WhatsApp permite 10 itens ativos**, e o painel bloqueia o 11º com uma explicação em português (`conteudo/actions.ts`: *"O menu do WhatsApp permite no máximo 10 itens ativos. Oculte outro antes de ativar este."*). Com Privacidade + nove itens, o menu **já está cheio**. Então nunca prometa "a igreja adiciona o que quiser": conte os itens junto com o pastor na hora de montar, e deixe folga de propósito. Se ele quiser um item novo depois, alguém oculta outro. Ver [[Menu Inventory]].

### Quanto tempo
> "A parte que depende de mim é a parte rápida, e eu não vou dar um número porque eu ainda não fiz isso com igreja nenhuma — o senhor seria a primeira. A parte lenta não é minha nem sua: a Meta precisa verificar a igreja, e isso leva dias, às vezes pede documento. Eu começo isso no primeiro dia, não no último, e aviso o senhor a cada passo. O que eu não faço é dar data que eu não controlo."

### O que NÃO prometer no onboarding
- ❌ "Depois vocês trocam a senha" — **não existe troca de senha nem recuperação** ([[Whats Left]]). Hoje a senha é gerada por Rafael e só ele muda, na mão. Diga isso, ou não diga nada.
- ❌ "Vocês são avisados quando chega mensagem" — não são. Não existe notificação de nenhum tipo ([[Whats Left]]).
- ❌ "Se der problema de madrugada a gente vê" — não há monitoramento nem alerta. Se o bot morrer às 2h, ninguém fica sabendo até um membro reclamar.
- ❌ "Se a cobrança falhar, vocês têm sete dias" — **não existe cobrança**. Nenhuma frase sobre prazo, suspensão automática ou reativação pode ser dita antes do Stripe existir.
- ❌ "A igreja adiciona quantos itens quiser no menu" — o teto do WhatsApp é 10 ativos, e o painel bloqueia o 11º.
- ❌ "Em um dia a igreja está no ar" — Rafael nunca colocou igreja nenhuma no ar. Nenhum prazo próprio até ter feito uma vez.
- ❌ Qualquer data para nota fiscal, cobrança, PIX, boleto, aplicativo, ou avisos.

---

## 6 · When the church asks for something the product can't do

**The rule:** every answer is a **no** or a **not yet with no date**. Never a "vai ter". [[Backlog]] is a wishlist, not a commitment, and a pastor remembers a promise for a year.

Three buckets, and the phrase for each:

**(a) Não vai ter — é outro produto.** Avisos/broadcast, aplicativo próprio, membresia, controle de contribuições, inscrição em evento, multi-idioma.
> "Isso a gente não faz, e não é falta de tempo — é escolha. Se eu tentar fazer tudo, faço tudo mal. Existem sistemas de gestão de igreja que fazem isso bem, e eles não fazem o que eu faço."

**(b) Está desenhado, ainda não construído — sem data.** Nota fiscal, ferramentas de exclusão e exportação de dados, cobrança automática. *(Os três estão em "specced, ready to plan, not built" — desenho pronto, código nenhum. "Está sendo construído" já é generoso demais.)*
> "Isso está desenhado, mas ainda não está pronto, e eu não vou dar uma data porque a data seria chute. Quando estiver pronto eu aviso o senhor — e enquanto não estiver, eu não cobro por ele."

**(c) Está faltando e eu sei.** Notificação, troca e recuperação de senha, monitoramento, análise de uso.
> "Isso falta mesmo, e eu prefiro contar agora do que o senhor descobrir depois. Hoje o jeito é [alternativa concreta]. Se isso for impeditivo para vocês, é melhor a gente esperar."

**And when the answer is "you don't need me":**
> "Sinceramente? Do jeito que está, o WhatsApp Business que a Meta dá de graça já resolve o que o senhor descreveu. Se um dia o volume crescer e virar problema, me chama."

Dizer isso perde uma venda e ganha a indicação seguinte — e indicação é a única moeda que funciona neste mercado.

---

## 7 · The lines that never bend

*This numbered list is the product's one explicit ban list — the single place where a forbidden word is written down so it can be recognised. It appears nowhere else in the kit.*

1. **Nunca a palavra "dízimo"** — em nenhum asset, em nenhuma conversa. É "Ofertas" ([[Decisions Log]]).
2. **Nunca "o sistema é compatível com a LGPD"** — diga o que ele faz. Recusar a frase ganha mais confiança do que a frase ganharia.
3. **Nunca um cliente, um número de uso, um print ou um depoimento que não exista.** Nenhuma igreja usa isto hoje.
4. **Nunca um preço improvisado, nem uma estrutura de preço.** Nem o número nem o formato foram decididos — não há o que "vender como estrutura" ainda.
5. **Nunca uma frase sobre cobrança, prazo, suspensão ou reativação.** Não existe cobrança nenhuma construída.
6. **Nunca esconder o chip novo** — levante você, nos dois primeiros minutos.
7. **Nunca prometer notificação, senha, nota fiscal, prazo próprio ou data.**
8. **Nunca um número que Rafael não mediu** — nem sobre a igreja do pastor, nem sobre o mercado, nem sobre um concorrente. Ver §8.1.
9. **Desqualificar é um resultado bom.** Uma igreja pequena e feliz com o status quo não é um lead mal trabalhado; é um lead que não existe.

---

## 8 · Unverified facts, and where the code overruled a review

### 8.1 · Não verificado — checar antes de usar

Nada aqui foi confirmado. Estão registrados em vez de apagados porque **algo neste kit dependia deles**, e a dependência precisa continuar visível. Regra de sourcing, copiada da spec de nota fiscal: quem confirmar escreve **a URL e a data em que leu**, mais a ressalva de que preço de terceiro envelhece.

| Afirmação | Onde aparecia | Estado | O que fazer |
|---|---|---|---|
| "Há concorrente anunciando IA por R$ 19,90" | argumento do card 4.4 | **Sem fonte.** Não existe pesquisa de concorrente no brain. | Achar o produto, salvar URL + data da leitura, anotar o tier exato. Até lá, não citar preço de concorrente numa conversa. |
| "A âncora de preço do mercado já foi fincada por outros" | 4.6 *weak because* | **Sem fonte** — decorre da anterior. | Cai ou fica de pé junto com ela. |
| "Janeiro, fevereiro e julho são os meses de caixa apertado da igreja" | §1, timing | **Sem fonte.** Plausível, não medido. | Perguntar a dois tesoureiros. Não montar calendário comercial em cima disso antes. |

### 8.2 · Onde [[Whats Left]] e o código venceram a revisão

A revisão de 2026-08-08 afirmou que `provisionChurch()` cria o item 🔒 Privacidade **em cima das 9 linhas do seed**, chegando a 10 de 10 na primeira igreja. **O código diz outra coisa.** `src/lib/provisioning.ts` insere exatamente três coisas: a igreja, o admin da igreja, e o item Privacidade — nenhuma outra linha de menu. As 9 linhas vivem em `src/db/seed.ts`, que se descreve como *"LOCAL DEVELOPMENT FIXTURE ONLY — never run this against production"* e é protegida por uma checagem de `NODE_ENV`. Uma igreja de verdade nasce com **um** item, não com dez.

Duas consequências, e nenhuma delas é a que a revisão previu:
- O teto de 10 **não** é atingido no provisionamento. É atingido quando Rafael monta o menu completo — Privacidade + 9 = 10 — e aí sim a igreja não cabe mais um "Escola Bíblica". Então a conclusão da revisão ("não venda 'adicione o que quiser'") **fica de pé**; o mecanismo dela não. §5 agora conta os itens junto com o pastor.
- O trabalho de montar o menu é **manual e de Rafael**, por uma tela que ninguém nunca abriu num navegador. Isso é mais caro do que "os 9 itens já vêm prontos" sugeria, e §5 passou a dizer isso.

O teto, aliás, **é** enforçado: `src/app/admin/(protected)/conteudo/actions.ts` recusa o 11º item ativo em português. [[Menu Inventory]] ainda o trata como pergunta em aberto ("the panel must enforce this") — essa nota é que está desatualizada, não o código.

*Fora do escopo desta passagem, mas confirmado:* `03 Operations/Launch Checklist.md:54` ainda diz que a equipe "troca a senha temporária". Não existe troca de senha. **O kit está certo e a checklist está errada** — corrigir lá, não aqui.

---

## 9 · Revisões

**2026-08-08 — passagem contra `critique-mkt-sales.md`.** Só este arquivo foi tocado.

- **A abertura do WhatsApp prometia notificação** (*"ele se cala e avisa a secretaria"*). Era a frase mais enviada do kit e contradizia o próprio kit. Agora diz que a conversa espera numa caixa de entrada que alguém abre. A mesma honestidade virou o item 3 da página única, em vez de ficar só nas notas internas.
- **Estatística inventada removida** — *"responde quarenta vezes por mês"* era ficção sobre a igreja do pastor. Virou pergunta, que vende melhor e não mente.
- **Card 4.6 travado.** Vendia prazo de sete dias, suspensão e reativação automáticas: tudo isso é Stripe, que está *specced, not built*. Também comprometia estrutura de preço não decidida ("mensalidade fixa", "sem taxa de instalação"). Substituído pela única resposta honesta de hoje: ainda não cobro. Cobrança virou a quarta linha da tabela de portões do §0 e a regra 7.5. O mesmo erro foi corrigido no 4.7.
- **Igreja sem CNPJ deixou de ser 🟢.** Passou a "piloto que provavelmente nunca converte", com o motivo real citado ([[Meta WhatsApp Setup]]: a verificação da Meta pode pedir documento, CNPJ ajuda) — e sem CNPJ não há a quem emitir nota depois.
- **Teto de menu:** a conclusão da revisão foi aceita, o mecanismo dela foi refutado com o código. Ver §8.2.
- **Fatos externos marcados, não apagados** (R$ 19,90 do concorrente; os meses de caixa apertado). Saíram dos argumentos, entraram no §8.1 com o que precisa ser feito para usá-los. Regra de fonte: URL + data da leitura + ressalva de validade.
- **pt-BR:** "o robô cala a boca" → "o robô se cala"; o colchete de indicação virou frase que encaixa; "o culto é 19h" → "é às 19h"; "pela quadragésima vez" → "pela milésima"; e o tratamento foi unificado em *o senhor* nas linhas faladas (4.9, 4.10, §5, §6) — antes misturava *te aviso / te dar* na mesma frase.
- **"OTB Jovens" e "GD Adultos"** eram nomes internos de uma igreja e apareciam como se fossem do produto. Viraram `[nome do grupo de jovens]`.
- **"Em um dia a igreja está no ar" caiu.** Era o único prazo do kit e Rafael nunca o executou uma vez.
- **A palavra proibida da regra 7.1** aparecia duas vezes, nas duas listas de proibições do kit. Agora existe uma lista só, o §7, que é a lista explícita onde a regra permite escrevê-la; o rodapé do §2.2 apenas aponta para lá. Em nenhum outro lugar, em nenhum outro asset.
- **Adicionado, e é uma retirada disfarçada:** o §0 agora diz que toda a metade de painel do produto está *built but never exercised*, e o §3 exige que Rafael rode o roteiro sozinho antes de rodá-lo na frente de um pastor.
- **Nada foi prometido a mais nesta passagem.** As únicas frases novas em pt-BR são confissões (o item 3 da página única, o minuto 6, o "ainda não vou cobrar") ou restrições ao próprio Rafael. Nenhuma capacidade nova foi afirmada.
