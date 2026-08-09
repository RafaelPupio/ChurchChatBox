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
      // RETURNS, and that return is the whole point. The block below prints a live
      // credential. Without this the warning above merely narrated the leak while
      // the link went into the same log — readable by anyone with Vercel runtime
      // logs or a drain into Datadog/Axiom, i.e. a contractor or a teammate. They
      // could request a reset for a known admin address, lift the link within the
      // hour, and take the account, while the victim got no "was this you?" mail
      // because nothing is delivered. Print the refusal; never print the link.
      return;
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
