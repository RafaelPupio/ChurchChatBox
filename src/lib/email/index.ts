import { consoleEmailSender } from './console-sender';
import { passwordResetEmail } from './messages';
import type { EmailSender } from './types';

export type { EmailSender, OutboundEmail } from './types';

/** THE SWAP POINT. This one line chooses the transport.
 *
 *  To ship real delivery: add src/lib/email/resend-sender.ts exporting an
 *  EmailSender, and change this line to point at it. Nothing else in the codebase
 *  changes — not a caller, not a string, not a test.
 *
 *      const sender: EmailSender = process.env.RESEND_API_KEY
 *        ? resendEmailSender
 *        : consoleEmailSender;
 *
 *  Deliberately NOT chosen by NODE_ENV: a production deployment with no provider
 *  configured must still take the console path and log its refusal loudly, rather
 *  than reaching for a transport that is not there and throwing. */
const sender: EmailSender = consoleEmailSender;

/** Whether a message sent from here actually reaches a person.
 *
 *  The login page uses this to decide whether to offer "Esqueci minha senha" at
 *  all. Without it the panel advertises a flow that answers "se o endereço
 *  estiver cadastrado, enviamos um link" while delivering nothing — a false
 *  statement to a locked-out secretary, who then waits for a message that is
 *  never coming instead of asking for help.
 *
 *  Update this alongside the transport on the line above; they are the same
 *  decision written twice, and a future reader should see them together. */
export function isEmailDeliveryConfigured(): boolean {
  return sender !== consoleEmailSender;
}

/** Sends the password-reset link. NEVER THROWS, and that is a security property
 *  rather than laziness.
 *
 *  Its only caller must produce a byte-identical response whether or not the
 *  address belongs to an account. If a provider outage could propagate out of
 *  here, the caller would have to either surface an error — which it can only do
 *  on the branch where an account exists, instantly turning the form into an
 *  account-existence oracle — or wrap this in a try/catch that the next person to
 *  add a caller would forget. Absorbing it here means the guarantee cannot be
 *  lost by accident, and a real transport is free to throw as loudly as it likes.
 *
 *  A swallowed failure is not a silent one: it is logged for the operator. What
 *  the user is told is the truth either way — that if the address is registered,
 *  a message is on its way. */
export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  try {
    await sender.send(passwordResetEmail(to, link));
  } catch (error) {
    console.error(`[email] transport "${sender.name}" failed to send a password reset:`, error);
  }
}
