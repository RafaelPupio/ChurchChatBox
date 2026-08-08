import type { EmailSender, OutboundEmail } from './types';

/** The development transport: it prints the message to the server console and
 *  delivers nothing.
 *
 *  This exists because the product has no email provider yet, and the rest of the
 *  reset flow — token, hashing, expiry, single use, session revocation — is
 *  finished and testable without one. Running `npm run dev` and reading the link
 *  out of the terminal is the intended local workflow.
 *
 *  It shouts in production rather than failing, and the distinction matters: a
 *  throw here would make the reset form behave differently depending on whether
 *  the address exists, which is the account-existence oracle the whole flow is
 *  designed to avoid. So it stays silent to the user and loud to the operator. */
export const consoleEmailSender: EmailSender = {
  name: 'console (development)',

  async send(email: OutboundEmail): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[email] NO EMAIL PROVIDER CONFIGURED. This message was NOT delivered to anyone. ' +
          'Self-service password reset cannot work in production until a real transport is ' +
          'wired into src/lib/email/index.ts.',
      );
    }

    // One block, so a copy-paste out of the terminal gets the whole thing. The
    // link is a live credential: this output belongs in a developer's terminal
    // and must never be shipped to a log aggregator a real provider would replace.
    console.log(
      [
        '',
        '──────── [email: password reset] ────────',
        `to:      ${email.to}`,
        `subject: ${email.subject}`,
        '',
        email.text,
        '─────────────────────────────────────────',
        '',
      ].join('\n'),
    );
  },
};
