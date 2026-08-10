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
   *  than an acknowledgement ("De nada!") because a church closing a conversation
   *  with a member blesses her. One sentence: she said thank you, and the reply
   *  should end there rather than start something. */
  courtesyText: 'Que Deus abençoe você e sua família! 🙏',
};

/** The one menu item every church starts with. LGPD Art. 9 gives members the
 *  right to clear information about how their data is used, so transparency is a
 *  compliance mechanism rather than optional content.
 *
 *  It states data is handled IN ACCORDANCE WITH the LGPD — a statement about
 *  practice. It deliberately does not claim "this app is compliant", which is a
 *  legal representation software cannot guarantee.
 *
 *  It also does not promise an automated deletion command: that flow is the
 *  later LGPD plan. Until it exists, members are directed to the church. */
export const PRIVACY_ITEM = {
  position: 1,
  label: '🔒 Privacidade',
  kind: 'content' as const,
  bodyText: [
    '*Privacidade e seus dados*',
    '',
    'Seus dados são tratados de acordo com a LGPD (Lei nº 13.709/2018).',
    '',
    '*O que guardamos:* seu número de WhatsApp, as mensagens desta conversa e, se você enviar, seu pedido de oração.',
    '',
    '*Por quê:* para responder às suas dúvidas e atender aos seus pedidos.',
    '',
    // Deliberately NOT "apagadas após 12 meses" until the retention purge exists.
    // That sentence shipped before anything deleted anything, which made the one
    // menu item whose whole job is telling members the truth about their data the
    // one place the product lied. A promise you do not keep is worse under LGPD
    // than one you never made. Restore the 12-month wording in the same commit
    // that ships the purge — see docs/superpowers/specs/2026-08-07-lgpd-data-subject-tooling.md
    '*Por quanto tempo:* enquanto a igreja precisar deles para te atender. Você pode pedir a exclusão a qualquer momento.',
    '',
    '*Seus direitos:* você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento. Para isso, entre em contato com a secretaria da igreja.',
    '',
    '_Edite este texto no painel._',
  ].join('\n'),
};
