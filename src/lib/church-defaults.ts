/** The pt-BR strings a newly provisioned church starts with. Every one of these
 *  is an editable row, not a constant — the panel writes them. */
export const CHURCH_DEFAULTS = {
  name: 'Minha Igreja',
  greetingText: 'Olá! 🙏 Sou a secretária virtual da igreja. Como posso te ajudar?',
  menuHeaderText: 'Escolha uma opção:',
  menuButtonLabel: 'Ver opções',
  fallbackText: 'Desculpe, não entendi. 🙏 Escolha uma das opções abaixo:',
  unsupportedMediaText: 'Por enquanto eu entendo apenas texto e as opções do menu. 🙏',
  errorText: 'Estamos com uma instabilidade no momento. Por favor, tente novamente em instantes 🙏',
  prayerPromptText: 'Pode escrever seu pedido de oração 🙏 Vamos orar por você!',
  prayerThanksText: 'Recebemos seu pedido! ❤️ Nossa equipe estará orando por você.',
  handoffText: 'Um momento! 😊 Alguém da secretaria vai te atender por aqui em breve.',
  handoffClosedText: 'Atendimento encerrado. Se precisar de mais alguma coisa, é só chamar! 🙏',
  /** The answer to "obrigada", "amém", "Deus abençoe" — the words a member uses
   *  to CLOSE a conversation, not to ask something. Written to fit both a thank
   *  you and an amém, because it answers both, and written as a blessing rather
   *  than a bare acknowledgement ("De nada!") because a church closing a
   *  conversation with a member blesses her. It opens on "Amém!" because the
   *  natural Brazilian beat answers the thanks before blessing, and it names
   *  nobody but her — an earlier draft said "e sua família", which presumes one
   *  and lands wrong on a widow or someone estranged from theirs. One sentence:
   *  she said thank you, and the reply should end there rather than start
   *  something. Editable in Configurações like every other thing the bot says. */
  courtesyText: 'Amém! 🙏 Que Deus abençoe você.',
};

/** Every body this item has ever been SEEDED with, frozen.
 *
 *  PRIVACY_ITEM is a seed: each church holds its own editable menu_item row, so
 *  changing the constant updates nobody. The owner console's rollout button
 *  rewrites a church's row ONLY when its current body is byte-identical to one of
 *  these — which is the mechanism for "the vendor may replace vendor-authored
 *  text, never the controller's own words".
 *
 *  Never edit an entry here. Append when PRIVACY_ITEM.bodyText changes, and move
 *  the outgoing body in. A church still carrying an older default is otherwise
 *  invisible to the rollout and would be left on text the product no longer
 *  honours. */
export const PRIVACY_ITEM_PREVIOUS_BODIES: readonly string[] = [
  // v0 — promised a 12-month purge before anything deleted anything.
  [
    '*Privacidade e seus dados*',
    '',
    'Seus dados são tratados de acordo com a LGPD (Lei nº 13.709/2018).',
    '',
    '*O que guardamos:* seu número de WhatsApp, as mensagens desta conversa e, se você enviar, seu pedido de oração.',
    '',
    '*Por quê:* para responder às suas dúvidas e atender aos seus pedidos.',
    '',
    '*Por quanto tempo:* as conversas são apagadas após 12 meses.',
    '',
    '*Seus direitos:* você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento. Para isso, entre em contato com a secretaria da igreja.',
    '',
    '_Edite este texto no painel._',
  ].join('\n'),
  // v1 — the promise withdrawn, because no purge existed yet.
  [
    '*Privacidade e seus dados*',
    '',
    'Seus dados são tratados de acordo com a LGPD (Lei nº 13.709/2018).',
    '',
    '*O que guardamos:* seu número de WhatsApp, as mensagens desta conversa e, se você enviar, seu pedido de oração.',
    '',
    '*Por quê:* para responder às suas dúvidas e atender aos seus pedidos.',
    '',
    '*Por quanto tempo:* enquanto a igreja precisar deles para te atender. Você pode pedir a exclusão a qualquer momento.',
    '',
    '*Seus direitos:* você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento. Para isso, entre em contato com a secretaria da igreja.',
    '',
    '_Edite este texto no painel._',
  ].join('\n'),
];

/** The one menu item every church starts with.
 *
 *  v2. The statute is deliberately NOT named: "tratados de acordo com a LGPD"
 *  reads as "this is compliant" to a member of a church in the interior of Minas
 *  reading it on a phone, and the binding rule is that the bot never claims
 *  compliance. The rights are described in plain language instead, and backed by
 *  a real button in the panel — which is more use to a member than a law's number.
 *
 *  The retention sentence is only true because the nightly purge exists. If that
 *  job is ever removed, this sentence comes out in the SAME commit. */
export const PRIVACY_ITEM = {
  position: 1,
  label: '🔒 Privacidade',
  kind: 'content' as const,
  bodyText: [
    '*Privacidade e seus dados*',
    '',
    'Abaixo está o que a igreja guarda sobre você, por quê, por quanto tempo e com quem isso é compartilhado.',
    '',
    '*O que guardamos:* seu número de WhatsApp, seu nome no WhatsApp, as mensagens desta conversa e, se você enviar, seu pedido de oração.',
    '',
    '*Por quê:* para responder às suas dúvidas e atender aos seus pedidos.',
    '',
    '*Por quanto tempo:* as conversas e os pedidos de oração são apagados automaticamente após 12 meses.',
    '',
    '*Com quem compartilhamos:* apenas com os serviços que fazem este atendimento funcionar — o WhatsApp (Meta) e as empresas que hospedam nosso sistema. Não vendemos nem cedemos seus dados.',
    '',
    '*Seus direitos:* você pode pedir a qualquer momento uma cópia dos seus dados, a correção do seu nome ou a exclusão de tudo. Fale com a secretaria da igreja.',
    '',
    'A conversa também fica no seu aparelho e nos servidores do WhatsApp, fora do nosso controle. E se você escrever de novo depois da exclusão, um novo histórico começa.',
  ].join('\n'),
};
