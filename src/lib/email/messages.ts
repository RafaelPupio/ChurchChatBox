import type { OutboundEmail } from './types';

/** The password-reset email, in Brazilian Portuguese, written for a volunteer who
 *  does not work in technology.
 *
 *  Two things this message deliberately does NOT contain:
 *
 *  1. The name of the church. Admin addresses in this product are typed by hand at
 *     provisioning and are never verified (see the report), so a single typo means
 *     this message lands in a stranger's real mailbox. A stranger receiving it
 *     should learn nothing except that some system they do not use exists. Naming
 *     the church would tell them which congregation to go looking at.
 *  2. Any hint about who requested it, or from where. There is nothing useful to
 *     say and every extra fact is a fact leaked to whoever actually opened it.
 *
 *  The "if this wasn't you" paragraph avoids alarming language. The realistic
 *  reader is someone who mistyped their own address a moment ago, not a victim. */
export function passwordResetEmail(to: string, link: string): OutboundEmail {
  return {
    to,
    subject: 'Criar uma nova senha do painel',
    text: [
      'Olá!',
      '',
      'Recebemos um pedido para criar uma nova senha de acesso ao painel da Secretária Virtual.',
      '',
      'Para escolher a sua nova senha, abra o endereço abaixo:',
      '',
      link,
      '',
      'Esse endereço funciona por 1 hora e só pode ser usado uma vez. Depois disso, é só pedir outro na tela de entrada do painel.',
      '',
      'Se não foi você que pediu, pode ignorar esta mensagem. Sua senha atual continua funcionando normalmente e ninguém consegue entrar sem abrir o endereço acima.',
      '',
      'Secretária Virtual',
    ].join('\n'),
  };
}
