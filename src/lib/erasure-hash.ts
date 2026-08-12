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

/** Every digit-form of a typed number worth testing against a stored hash.
 *
 *  Stored numbers come from Meta's `from` field: E.164 without the plus, country
 *  code always present (5511999998888). Numbers in the verify box come from a
 *  secretary's keyboard, and "(11) 99999-8888" is the normal way to write one in
 *  Brazil. hashPhone strips punctuation but cannot invent a country code, so the
 *  two hash differently and a single-hash lookup reports "not erased" for someone
 *  who was — a false negative that reads exactly like a clean answer.
 *
 *  So: try what was typed, and if it looks like a Brazilian number missing its
 *  country code, try it with 55 as well. Ordered most-likely-first; the caller
 *  stops at the first hit.
 *
 *  Deliberately NOT a general E.164 parser. This product serves Brazilian churches
 *  and every stored number begins 55; a library that guessed at forty country
 *  conventions would add failure modes to buy nothing. It also never STRIPS a
 *  leading 55, because 55 is also a valid area code prefix in other countries and
 *  guessing wrong would silently widen a lookup keyed on an audit record.
 *
 *  Returns [] when the secret is unset — same reason hashPhone returns null. */
export function phoneHashCandidates(typed: string): string[] {
  const digits = typed.replace(/\D+/g, '');
  if (!digits) return [];

  const forms = [digits];
  // 10 digits = landline + area code, 11 = mobile with the nono dígito. Either
  // way, no country code — so the same line stored by the webhook carries 55.
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    forms.push(`55${digits}`);
  }

  return forms.map(hashPhone).filter((h): h is string => h !== null);
}
