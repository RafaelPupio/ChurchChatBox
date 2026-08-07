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
    '*Por quanto tempo:* as conversas são apagadas após 12 meses.',
    '',
    '*Seus direitos:* você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento. Para isso, entre em contato com a secretaria da igreja.',
    '',
    '_Edite este texto no painel._',
  ].join('\n'),
};
