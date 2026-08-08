/** The two pt-BR strings the password-reset flow shows a visitor.
 *
 *  They live here, and not beside the Server Actions that return them, for a
 *  mechanical reason: a `'use server'` module may only export async functions, so
 *  a string exported from an actions file fails the build with
 *  "A 'use server' file can only export async functions, found string".
 *
 *  Both are single constants rather than strings written at each call site, which
 *  is the point — each is returned from several branches that MUST be
 *  indistinguishable, and two copies of a sentence are two sentences that can
 *  drift apart in a later edit. */

/** THE ONLY THING THE REQUEST FORM EVER SAYS when it is given an address.
 *
 *  Returned for a registered address, for an unregistered one, for one that hit
 *  the per-account throttle, and for one whose email failed to send. Any variation
 *  — a different word, an extra sentence, a "check your inbox" that appears only
 *  sometimes — turns the form into a tool for testing whether an address has an
 *  account. That matters more here than in most products: admin_user.email carries
 *  a GLOBAL unique index, so one address is one admin across every church.
 *  Confirming an address exists therefore also confirms that this person
 *  administers *some* church, which for a religious organisation is sensitive
 *  personal data under LGPD Art. 5 II.
 *
 *  The honesty problem it has to solve at the same time: the overwhelmingly most
 *  likely reader is not an attacker, it is a volunteer who mistyped her own
 *  address. "Se este e-mail estiver cadastrado" is the conditional that keeps the
 *  sentence true, and the last two clauses give her somewhere to go instead of
 *  leaving her waiting for a message that is never coming. */
export const RESET_REQUESTED_MESSAGE =
  'Se este e-mail estiver cadastrado, enviamos uma mensagem com o endereço para criar uma nova senha. ' +
  'Ela pode levar alguns minutos para chegar — vale olhar também na caixa de spam. ' +
  'Se não chegar, confira se digitou o e-mail exatamente como ele foi cadastrado, ou peça ajuda a quem cuida do sistema na sua igreja.';

/** One message for every way a link can fail: never issued, already used, expired,
 *  or belonging to an admin who has since been removed. Distinguishing them would
 *  tell whoever holds a token which of those it is, and the remedy is the same in
 *  all four cases. */
export const LINK_UNUSABLE_MESSAGE =
  'Este endereço não funciona mais. Ele vale por 1 hora e só pode ser usado uma vez. ' +
  'Peça um novo em "Esqueci minha senha".';
