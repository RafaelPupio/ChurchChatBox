import Link from 'next/link';
import s from './site.module.css';

/** The public landing page.
 *
 *  Copy is the pt-BR written in brain/06 Marketing/Landing Page Copy.md, which
 *  carries the rules this page obeys. The load-bearing ones, restated here so a
 *  future edit does not quietly break them:
 *
 *   1. NO testimonials, NO church logos, NO statistics. Nothing is live. A page
 *      that needs a number to work is a page saying the wrong thing.
 *   2. NEVER "em conformidade com a LGPD", or any phrasing that means it. Say
 *      what the system DOES. The refusal is the strongest line on the page.
 *   3. "Ofertas", never "dízimo".
 *   4. The new chip appears in step 1, not in a FAQ.
 *   5. Nothing unbuilt is described in the present tense.
 *   6. No price. The ask is a conversation.
 *
 *  Fully static: a Server Component with no client JS at all. The reader is on a
 *  mid-range Android in Brazil, possibly on mobile data, possibly at night.
 *
 *  ⚠️ TWO SLOTS TO FILL BEFORE THIS IS THE VERIFICATION SITE:
 *   - CONTACT below is a personal address. Meta cross-checks the site against the
 *     CNPJ, and a church writing to a gmail reads as a hobby. Replace with the
 *     business address and a wa.me link once the number exists.
 *   - The footer's legal line needs razão social + CNPJ verbatim as registered.
 *  Both are marked in place rather than filled with plausible placeholders,
 *  because a plausible placeholder is the kind of thing that ships. */

const CONTACT = 'mailto:rafaelpupio@gmail.com?subject=Secret%C3%A1ria%20Virtual%20para%20a%20minha%20igreja';

export default function LandingPage() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={`${s.wrap} ${s.headerInner}`}>
          <span className={s.brand}>
            Secretária Virtual <span className={s.brandMark}>·</span>
          </span>
          <Link href="/admin" className={s.headerLink}>
            Entrar no painel
          </Link>
        </div>
      </header>

      <main>
        {/* ---------- hero ---------- */}
        <section className={s.hero}>
          <div className={`${s.wrap} ${s.heroGrid}`}>
            <div>
              <h1 className={s.h1}>
                Sábado, 22h40. Alguém pergunta que horas é o culto de amanhã.
                <em>Sua igreja responde na hora.</em>
              </h1>

              <p className={s.heroSub}>
                Uma secretária virtual no WhatsApp que responde às perguntas de sempre — horários,
                endereço, agenda, ofertas, pedido de oração — com as palavras que a sua igreja
                escreveu. Sem aplicativo para o membro baixar. Sem inteligência artificial
                inventando nada.
              </p>

              <div className={s.ctaRow}>
                <a href={CONTACT} className={s.btn}>
                  Quero conversar 20 minutos
                </a>
                <a href="#como-funciona" className={`${s.btn} ${s.btnGhost}`}>
                  Ver como funciona ↓
                </a>
              </div>

              <p className={s.heroHonesty}>
                Ainda não está no ar em nenhuma igreja. Estou escolhendo as primeiras — e elas não
                pagam, porque a cobrança ainda nem existe.
              </p>
            </div>

            {/* An ILLUSTRATION of the menu, not a screenshot. No outbound message
                from this product has ever succeeded, so a realistic capture would
                be a picture of something that has not happened. */}
            <figure className={s.phone}>
              <div className={s.phoneBar}>
                <span className={s.phoneAvatar} aria-hidden="true">⛪</span>
                <span>Igreja Batista Central</span>
              </div>
              <div className={s.phoneBody}>
                <p className={`${s.bubble} ${s.bubbleMine}`}>Boa noite! Que horas é o culto amanhã?</p>
                <p className={s.bubble}>
                  Olá! 🙏 Sou a secretária virtual da igreja. Como posso te ajudar?
                </p>
                <div className={s.menuCard}>
                  <div className={s.menuItem}>⛪ Horários dos cultos</div>
                  <div className={s.menuItem}>📍 Onde fica a igreja</div>
                  <div className={s.menuItem}>💝 Ofertas e PIX</div>
                  <div className={s.menuItem}>🙏 Pedido de oração</div>
                  <div className={s.menuItem}>💬 Falar com um atendente</div>
                  <div className={s.menuCta}>Ver opções</div>
                </div>
              </div>
              <figcaption className={s.phoneCaption}>
                Ilustração do menu. Não é uma captura de tela — o robô ainda não enviou a primeira
                mensagem de verdade.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ---------- problem ---------- */}
        <section className={`${s.section} ${s.sectionWarm}`}>
          <div className={s.wrap}>
            <h2 className={s.h2}>As mesmas cinco perguntas, a semana inteira</h2>
            <p className={s.lede}>
              Que horas é o culto. Onde fica. Tem estacionamento. Qual o PIX da oferta. Se dá para
              orar por alguém. Elas chegam no WhatsApp de alguém — quase sempre no celular pessoal de
              uma pessoa só, que responde no intervalo do trabalho, no sábado à noite, no meio do
              almoço de domingo.
            </p>
            <p className={s.p}>
              Não é um problema de tecnologia. É que a pessoa que responde tem uma vida, e a pergunta
              chega quando ela não está. Quem escreveu às 22h40 vai ler a resposta na segunda — se
              ainda quiser.
            </p>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section className={s.section} id="como-funciona">
          <div className={s.wrap}>
            <h2 className={s.h2}>Como funciona, em 3 passos</h2>
            <p className={s.lede}>
              Não tem instalação, não tem servidor para a igreja cuidar, e ninguém da equipe precisa
              aprender nada além de digitar um texto.
            </p>

            <div className={s.steps}>
              <div className={s.step}>
                <span className={s.stepNum}>1</span>
                <h3 className={s.stepTitle}>A igreja compra um chip novo</h3>
                <p className={s.stepBody}>
                  Um número novo, só para o robô. Eu cuido do cadastro dele na Meta, que é a dona do
                  WhatsApp.
                </p>
                {/* The whole reason this is in step 1: found nowhere else in the
                    category, and a church that discovers it on day one after
                    signing feels tricked. */}
                <p className={s.stepWarn}>
                  <strong>Precisa ser um número novo.</strong> Quando um número entra na plataforma
                  oficial do WhatsApp, ele para de funcionar no aplicativo comum — para sempre, e o
                  histórico não vai junto. Por isso nunca use o número que a igreja já usa. Um chip
                  pré-pago resolve.
                </p>
              </div>

              <div className={s.step}>
                <span className={s.stepNum}>2</span>
                <h3 className={s.stepTitle}>Vocês escrevem o que ele responde</h3>
                <p className={s.stepBody}>
                  Num painel em português, a secretária escreve cada resposta com as palavras da
                  igreja. Horários, endereço, PIX, o texto de boas-vindas. Mudou o horário do culto?
                  Ela edita e já valeu — sem me chamar.
                </p>
              </div>

              <div className={s.step}>
                <span className={s.stepNum}>3</span>
                <h3 className={s.stepTitle}>O membro conversa normalmente</h3>
                <p className={s.stepBody}>
                  Ele manda mensagem para o número da igreja como manda para qualquer pessoa. Recebe
                  um menu, toca no que quer e tem a resposta na hora. Se pedir para falar com alguém,
                  o robô se cala e avisa a secretaria.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- what it answers ---------- */}
        <section className={`${s.section} ${s.sectionWarm}`}>
          <div className={s.wrap}>
            <h2 className={s.h2}>O que ele responde</h2>
            <p className={s.lede}>
              Tudo isso é texto que a sua igreja escreve — e muda quando quiser. O menu é seu.
            </p>
            <ul className={s.answers}>
              <li className={s.answer}><span className={s.answerIcon}>⛪</span><span>Horários dos cultos e da escola bíblica</span></li>
              <li className={s.answer}><span className={s.answerIcon}>📍</span><span>Endereço, ponto de referência, estacionamento</span></li>
              <li className={s.answer}><span className={s.answerIcon}>🗓️</span><span>A agenda da semana, com imagem se vocês quiserem</span></li>
              <li className={s.answer}><span className={s.answerIcon}>💝</span><span>Ofertas: a chave PIX e o que a igreja quiser explicar</span></li>
              <li className={s.answer}><span className={s.answerIcon}>🙏</span><span>Pedido de oração, que chega numa lista para a equipe</span></li>
              <li className={s.answer}><span className={s.answerIcon}>💬</span><span>&quot;Quero falar com alguém&quot; — e aí entra gente de verdade</span></li>
            </ul>
          </div>
        </section>

        {/* ---------- what it is NOT ----------
            This section answers the objection the category is already marketing
            against: a real competitor leads with "experiência real do WhatsApp,
            NÃO chatbots" — i.e. that automation feels cold to a congregation.
            The answer is not "our bot feels human". It is that it never pretends
            to be, and it leaves. */}
        <section className={s.section}>
          <div className={s.wrap}>
            <h2 className={s.h2}>O que ele não é</h2>
            <p className={s.lede}>
              Vale dizer isso antes de você descobrir sozinho, porque é o tipo de coisa que estraga a
              confiança quando aparece depois.
            </p>
            <ul className={s.notList}>
              <li className={s.notItem}>
                <strong>Não é um robô fingindo ser gente.</strong> Ele se apresenta como secretária
                virtual na primeira mensagem. Ninguém é enganado achando que está falando com a
                Dona Célia.
              </li>
              <li className={s.notItem}>
                <strong>Não é inteligência artificial.</strong> Ele não interpreta, não improvisa e
                não inventa. Responde o que está escrito no painel — e só. Para uma igreja isso é
                uma vantagem: nenhuma resposta sai sem alguém ter escrito antes.
              </li>
              <li className={s.notItem}>
                <strong>Não substitui o pastoreio.</strong> Ele tira do caminho as perguntas de
                horário e endereço para que a conversa que importa chegue mais rápido a uma pessoa —
                e some da frente na hora em que ela chega.
              </li>
              <li className={s.notItem}>
                <strong>Não manda mensagem para ninguém sozinho.</strong> Ele só responde quem
                escreveu primeiro. Não existe disparo, não existe lista de transmissão.
              </li>
            </ul>
          </div>
        </section>

        {/* ---------- member data ----------
            Rewritten 2026-08-12: export, erasure and the 12-month purge shipped.
            This section used to be an apology for their absence; it is now the
            strongest thing the product can say to a church. Rule 2 still binds —
            describe what it DOES, never claim conformity. */}
        <section className={`${s.section} ${s.sectionWarm}`}>
          <div className={s.wrap}>
            <h2 className={s.h2}>Os dados dos membros</h2>

            <div className={s.refusal}>
              <p>
                Não vou escrever aqui que o sistema &quot;está em conformidade com a LGPD&quot;. Essa
                é uma afirmação jurídica, e software nenhum garante isso sozinho — quem te disser o
                contrário está te vendendo tranquilidade, não fato.
              </p>
              <p>O que eu posso fazer é te contar exatamente o que o sistema faz.</p>
            </div>

            <div className={s.dataBlock}>
              <p className={s.dataPoint}>
                <strong>O que fica guardado</strong>
                <span>
                  O número de WhatsApp de quem escreveu, o nome que aparece no WhatsApp dele, as
                  mensagens daquela conversa e o pedido de oração, se ele enviar. Áudio, foto e
                  documento não são guardados — só o registro de que chegaram.
                </span>
              </p>

              <p className={s.dataPoint}>
                <strong>O membro é avisado, em português, dentro do próprio menu</strong>
                <span>
                  Tem um item 🔒 Privacidade que conta a ele o que é guardado, por quê, por quanto
                  tempo e com quem é compartilhado. Ele não precisa procurar isso num site — está na
                  mesma lista dos horários de culto.
                </span>
              </p>

              <p className={s.dataPoint}>
                <strong>Se um membro pedir os dados dele, a secretaria resolve na hora</strong>
                <span>
                  Numa tela do painel dá para ver tudo o que a igreja guarda sobre aquela pessoa,
                  baixar uma cópia para entregar a ela, corrigir o nome, ou apagar tudo. Não passa
                  por mim, não depende de eu estar disponível: é um botão da igreja.
                </span>
              </p>

              <p className={s.dataPoint}>
                <strong>Apagar deixa comprovante — e o comprovante não é uma cópia</strong>
                <span>
                  Toda exclusão fica registrada com data, quantas mensagens foram apagadas e quem da
                  equipe fez. O registro não guarda o número nem o nome nem o texto de nada: ele
                  serve para provar que foi apagado, não para guardar o que foi apagado.
                </span>
              </p>

              <p className={s.dataPoint}>
                <strong>Conversa velha some sozinha</strong>
                <span>
                  Depois de 12 meses, as conversas e os pedidos de oração são apagados
                  automaticamente, sem ninguém precisar lembrar. A igreja é avisada 30 dias antes dos
                  pedidos de oração vencerem, e pode baixar uma cópia se quiser guardar.
                </span>
              </p>

              <p className={s.dataPoint}>
                <strong>Uma igreja nunca enxerga os dados de outra</strong>
                <span>
                  Isso não é promessa: é uma bateria de testes automáticos que tenta, de propósito,
                  ler os dados de uma igreja usando a identidade de outra, e confere que não vem
                  nada. Eu rodo essa bateria antes de publicar qualquer mudança. Prefiro te mostrar
                  um teste que ataca o sistema a te dar a minha palavra.
                </span>
              </p>

              <p className={s.dataPoint}>
                <strong>A igreja é a dona dos dados dos seus membros</strong>
                <span>
                  Quem responde ao membro é a igreja, e é a igreja quem manda no que está guardado.
                  Eu opero o sistema para vocês.
                </span>
              </p>

              <p className={s.p}>
                Uma observação que o advogado da sua congregação vai fazer, então faço eu: a lista de
                quem frequenta uma igreja revela convicção religiosa, o que a LGPD trata como{' '}
                <strong>dado sensível</strong>. É por isso que este assunto ganhou uma seção inteira
                nesta página em vez de uma linha no rodapé.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- honest limits ----------
            Placed here on purpose: after the reader has seen how it works and is
            leaning toward yes, not in the hero where it only scares. */}
        <section className={s.section}>
          <div className={s.wrap}>
            <h2 className={s.h2}>O que ainda não existe</h2>
            <p className={s.lede}>
              Estou escrevendo isto antes de você perguntar, porque descobrir depois é o que quebra a
              confiança.
            </p>
            <ul className={s.limits}>
              <li className={s.limit}>
                <span className={s.limitMark}>◦</span>
                <span>
                  <strong>Cobrança.</strong> Não existe. É por isso que as primeiras igrejas não
                  pagam — não é generosidade, é que eu ainda não construí a parte de cobrar.
                </span>
              </li>
              <li className={s.limit}>
                <span className={s.limitMark}>◦</span>
                <span>
                  <strong>Nota fiscal.</strong> Também não. Se a sua igreja precisa de nota para
                  pagar qualquer coisa, precisamos conversar sobre isso antes.
                </span>
              </li>
              <li className={s.limit}>
                <span className={s.limitMark}>◦</span>
                <span>
                  <strong>Submenus.</strong> O menu tem um nível só, com até 10 opções. Dá para
                  organizar bem uma igreja; não dá para montar uma árvore.
                </span>
              </li>
              <li className={s.limit}>
                <span className={s.limitMark}>◦</span>
                <span>
                  <strong>Nunca esteve no ar.</strong> Nenhuma igreja usa isto hoje. Você seria a
                  primeira, com tudo o que isso significa de bom e de ruim.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* ---------- who ---------- */}
        <section className={`${s.section} ${s.sectionWarm}`}>
          <div className={s.wrap}>
            <h2 className={s.h2}>Quem faz isso</h2>
            <p className={s.lede}>
              Sou o Rafael. Eu escrevi este sistema sozinho e sou eu quem vai atender a sua igreja —
              não tem equipe de suporte, não tem chamado, não tem robô respondendo sobre o robô.
            </p>
            <p className={s.p}>
              Isso tem um lado bom e um ruim, e os dois são verdade. O bom: você fala com quem
              constrói, e o que você pedir na terça pode existir na sexta. O ruim: se eu ficar
              doente, ninguém me substitui. Prefiro que você saiba disso antes de decidir.
            </p>
          </div>
        </section>

        {/* ---------- CTA ---------- */}
        <section className={s.cta}>
          <div className={s.wrap}>
            <h2 className={s.h2}>As primeiras igrejas</h2>
            <p className={s.ctaBody}>
              Estou procurando poucas igrejas para começar — de preferência uma que já sofra com o
              WhatsApp lotado. Vinte minutos de conversa, sem compromisso e sem apresentação de
              vendas: eu quero entender como a sua secretaria funciona hoje.
            </p>
            <a href={CONTACT} className={`${s.btn} ${s.ctaBtn}`}>
              Quero conversar 20 minutos
            </a>
            <p className={s.ctaFine}>
              As primeiras igrejas não pagam nada, por tempo indeterminado. Quando a cobrança
              existir, eu aviso antes e você decide — não vira assinatura automática.
            </p>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footerGrid}`}>
          <div>
            <div>Secretária Virtual — atendimento no WhatsApp para igrejas.</div>
            {/* ⚠️ SLOT: razão social + CNPJ, exactly as registered. Meta compares
                this against the verification submission. Left empty rather than
                filled with a placeholder, because a placeholder ships. */}
            <p className={s.footerLegal}>
              WhatsApp é uma marca da Meta Platforms, Inc. Este produto não é afiliado à Meta.
            </p>
          </div>
          <div>
            <Link href="/admin">Entrar no painel</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
