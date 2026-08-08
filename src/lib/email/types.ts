/** One outbound message, already written. A transport delivers it; it never
 *  composes it — the pt-BR copy lives in ./messages.ts so that swapping the
 *  provider cannot accidentally rewrite what a church volunteer reads. */
export interface OutboundEmail {
  to: string;
  subject: string;
  /** Plain text. No HTML body on purpose: the only mail this product sends is a
   *  single link, HTML mail is where phishing-looking markup and broken rendering
   *  come from, and plain text renders identically in every client. */
  text: string;
}

/** The seam. Everything the product needs from an email provider.
 *
 *  To ship real delivery: add src/lib/email/resend-sender.ts implementing this,
 *  and change the one `const sender = …` line in src/lib/email/index.ts. No
 *  caller and no copy changes. That is the whole contract. */
export interface EmailSender {
  readonly name: string;
  send(email: OutboundEmail): Promise<void>;
}
