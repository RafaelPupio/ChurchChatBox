/** Defence-in-depth for the runtime log, not a fix for an observed leak.
 *
 *  src/lib/whatsapp.ts throws `Graph API ${status}: ${detail}` where `detail` is
 *  Meta's raw response body. Meta's /messages error payloads are documented to
 *  carry request context and the recipient number is PLAUSIBLY in it — but there
 *  is no Meta app in this repository, so nobody here has seen a real Graph error
 *  body. This guards a class of vector; it is not a launch blocker, and its
 *  priority could drop to zero once a live app exists. */

/** 10–15 digits, optionally +-prefixed. Short runs are left alone: HTTP status
 *  codes, retry counts and row counts are not numbers worth hiding, and redacting
 *  them would make the logs useless without making them safer. */
const PHONE_RE = /\+?\d{10,15}/g;

export function redactPhones(text: string): string {
  return text.replace(PHONE_RE, '+55…XX');
}

/** The two call sites log an Error, not a string, so redactPhones cannot be
 *  applied to them directly.
 *
 *  Stringifies name + message + stack and then redacts, so the stack survives AS
 *  TEXT. The cost is real and stated: Vercel's log viewer no longer receives a
 *  structured Error object and cannot source-map it. Accepted, because a member's
 *  phone number sitting in a log with an unknown retention window is worse than a
 *  stack trace that has to be read by hand.
 *
 *  Never throws. A catch-all handler that can itself throw turns a logged failure
 *  into an unlogged one. */
export function redactError(error: unknown): string {
  try {
    if (error instanceof Error) {
      return redactPhones(`${error.name}: ${error.message}\n${error.stack ?? ''}`);
    }
    return redactPhones(typeof error === 'string' ? error : JSON.stringify(error) ?? String(error));
  } catch {
    return '[unserialisable error]';
  }
}
