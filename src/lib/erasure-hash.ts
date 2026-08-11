import { createHmac } from 'node:crypto';

/** A one-way fingerprint of a phone number, so an erasure receipt can answer
 *  "sim, este número foi apagado em 12/03" without being a list of the people who
 *  asked to be erased.
 *
 *  KEYED (HMAC), not a bare hash. A plain SHA-256 of a phone number is trivially
 *  reversible: the search space is a few billion, and anyone holding the database
 *  could enumerate it in minutes. The key is what makes the digest testable only
 *  by someone who already has both the secret and a candidate number — a guessing
 *  game rather than a lookup.
 *
 *  The result is PSEUDONYMISED, not anonymous, and therefore still personal data
 *  under LGPD. It is retained under Art. 16 I as the accountability record Art. 6 X
 *  requires — which is also why it never crosses to the vendor's /owner view. */
export function hashPhone(phone: string): string | null {
  // Type-guarded before anything else. The contract below says this function never
  // throws, and an earlier version honoured that only for the missing-secret path:
  // hashPhone(null) raised a TypeError on .replace(). A function whose entire
  // justification is "never be the reason a statutory erasure fails" must not have
  // an input shape that makes it exactly that. Null is the same answer a missing
  // secret gives, and callers already handle it by storing a null hash.
  if (typeof phone !== 'string') return null;

  const secret = process.env.ERASURE_HASH_SECRET;
  // Deliberately not a throw. See the test: a missing operator env var must never
  // block a statutory erasure. The caller stores null and the verify box says the
  // check is unavailable in this installation.
  if (!secret) return null;

  // Digits only, so the same person hashes the same way whether the number was
  // typed as +55 11 99999-8888, (55) 11 99999 8888, or copied raw from WhatsApp.
  const digits = phone.replace(/\D+/g, '');
  if (!digits) return null;

  return createHmac('sha256', secret).update(digits).digest('hex');
}
