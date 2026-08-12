import { redirect } from 'next/navigation';
import {
  getSession,
  isAuthenticated,
  requireSession,
  sessionMatchesPassword,
  type SessionClaims,
} from '@/lib/auth/session';
import { findAdminById } from '@/lib/repo/admin';
import { getChurchById } from '@/lib/repo/church-admin';
import { effectiveStatus } from '@/lib/church-status';

export interface AdminIdentity {
  adminUserId: string;
  churchId: string;
  name: string;
}

/** AdminIdentity plus the acting staff EMAIL.
 *
 *  Only the data-rights guards return this. erasure_record.performed_by_email is a
 *  durable snapshot of who performed an erasure — it must survive that person
 *  leaving the church, and it is read back in Configurações as "· por {email}".
 *  A display name is neither unique nor an identifier, and SessionData carries no
 *  email at all, so it comes from the admin row verifyIdentity already fetches:
 *  one extra field, zero extra queries.
 *
 *  Deliberately NOT added to AdminIdentity: every read page and every write action
 *  would then carry a staff email it has no use for, and identityOf's job is to
 *  hand application code the least it needs. */
export interface DataRightsIdentity extends AdminIdentity {
  email: string;
}

/** Strips the guard-only claims off, so `pwdAt` never reaches application code. */
function identityOf(claims: SessionClaims): AdminIdentity {
  return { adminUserId: claims.adminUserId, churchId: claims.churchId, name: claims.name };
}

/** Checks 1 and 2 of the three documented on verifyWritable below, and NOT check
 *  3 (suspension).
 *
 *  Extracted so the data-rights guards share exactly the identity re-checks and
 *  nothing else. Deliberately does NOT call getChurchById: that query exists only
 *  to supply `status`/`graceUntil` for the suspension test, and folding it in here
 *  would add a church-existence redirect and one extra query to every protected
 *  page load. */
async function verifyIdentity(
  session: SessionClaims,
): Promise<DataRightsIdentity | { blocked: 'revoked' }> {
  const admin = await findAdminById(session.adminUserId);
  if (!admin || admin.churchId !== session.churchId) return { blocked: 'revoked' };
  if (!sessionMatchesPassword(session, admin.passwordChangedAt)) return { blocked: 'revoked' };
  // The EMAIL comes from the admin row this function already fetched — never from
  // the session, which does not carry one (see SessionData). erasure_record needs a
  // durable identifier for "who did this", and a WhatsApp-era display name is
  // neither unique nor an identifier. One extra field, zero extra queries.
  return { ...identityOf(session), email: admin.email };
}

/** The three checks the session cookie alone cannot make.
 *
 *  1. The admin still exists and still belongs to this church. A cookie proves
 *     who someone WAS; `removeStaff` can delete their row, and a removed
 *     secretary must not keep writing to the church's inbox until their cookie
 *     happens to expire.
 *  2. The password has not changed since this cookie was sealed. Same idea, one
 *     step further: a cookie proves who someone was AND which password they knew.
 *     iron-session is stateless, so a reset cannot delete anyone's session — this
 *     comparison is the only thing that ends one. It costs nothing, because the
 *     admin row is already in hand from check 1.
 *
 *     WHAT THIS DOES NOT CLOSE, stated plainly rather than left implicit: the
 *     window between the reset and the intruder's next request. The cookie stays
 *     unsealable-but-valid in their browser until they use it, and nothing here
 *     runs until they do. In practice that means "the intruder is ejected on their
 *     next page load or next write", not "at the instant of the reset" — there is
 *     no push channel and no session store to revoke against. Also unaffected:
 *     anything they already read and copied, and any data they exfiltrated before
 *     the reset. A reset ends access; it cannot undo access.
 *  3. The church is not suspended. */
async function verifyWritable(
  session: SessionClaims,
): Promise<AdminIdentity | { blocked: 'suspended' | 'revoked' }> {
  const identity = await verifyIdentity(session);
  if ('blocked' in identity) return identity;
  // Narrowed back to AdminIdentity: the writable path has no use for the email,
  // and widening every write action's identity would be scope creep.
  const { email: _email, ...adminIdentity } = identity;

  // getChurchById lives ONLY on this path. Its existence check is near-redundant —
  // admin_user.church_id is ON DELETE CASCADE, so a deleted church takes its admin
  // rows with it and findAdminById already returned undefined — but its real job is
  // supplying status and graceUntil, which only the suspension test needs.
  const church = await getChurchById(session.churchId);
  if (!church) return { blocked: 'revoked' };

  if (effectiveStatus(church.status, church.graceUntil, new Date()) === 'suspended') {
    return { blocked: 'suspended' };
  }

  return adminIdentity;
}

/** For Server Actions. No session at all redirects to login; the two revocation
 *  cases return a sentinel rather than throwing, so each action surfaces a pt-BR
 *  message in its own result shape. */
export async function requireWritableSession(): Promise<
  AdminIdentity | { blocked: 'suspended' | 'revoked' }
> {
  const session = await requireSession();
  return verifyWritable(session);
}

/** For Route Handlers, which must answer with a status code. Same checks, but
 *  "no session" is a returnable sentinel instead of a `redirect()`: a route that
 *  let NEXT_REDIRECT escape would serialise a framework control-flow signal into
 *  its own JSON error body. */
export async function checkWritableSession(): Promise<
  AdminIdentity | { blocked: 'unauthenticated' | 'suspended' | 'revoked' }
> {
  const session = await getSession();
  if (!isAuthenticated(session) || !session.churchId) return { blocked: 'unauthenticated' };
  return verifyWritable({
    adminUserId: session.adminUserId!,
    churchId: session.churchId!,
    name: session.name ?? '',
    pwdAt: session.pwdAt,
  });
}

/** For READ pages. Same existence + church-ownership re-check as the write guard,
 *  but it redirects on failure: a page has no result shape to render a refusal
 *  into, and there is nothing safe to show someone whose account is gone.
 *
 *  Deliberately does NOT block a suspended church — suspension makes the panel
 *  read-only, so reading is precisely what it may still do.
 *
 *  The cost is one extra DB read per page load, and that is the right trade here.
 *  Without it a removed secretary keeps reading every member phone number,
 *  message body and prayer request until their cookie expires. Religious
 *  affiliation is sensitive personal data under LGPD Art. 5 II and this is a
 *  former agent of the church: one indexed primary-key lookup is far cheaper than
 *  that exposure. */
export async function requireReadableSession(): Promise<AdminIdentity> {
  const session = await requireSession();

  const admin = await findAdminById(session.adminUserId);
  if (!admin || admin.churchId !== session.churchId) {
    redirect('/admin/login');
  }

  // The password-change check belongs on the READ path too, and arguably more so:
  // the thing a stale session is most useful for is reading member phone numbers,
  // message bodies and prayer requests, none of which requires a single write.
  // A guard that only revoked writes would leave the whole panel legible.
  if (!sessionMatchesPassword(session, admin.passwordChangedAt)) {
    redirect('/admin/login');
  }

  return identityOf(session);
}

/** THE DATA-RIGHTS GUARDS — the only guards in this file that deliberately skip
 *  the suspension check.
 *
 *  Erasure is the ONE WRITE a suspended church can perform. Export beside it is a
 *  read and grants no new reading power, since requireReadableSession already lets
 *  a suspended church read every message.
 *
 *  Why deletion is exempt, argued on its own terms — this comment exists because
 *  an implementer who does not understand it is one refactor away from routing
 *  the delete path through requireWritableSession and quietly breaking a statutory
 *  obligation:
 *
 *   1. It cannot be used to evade what suspension is FOR. Suspension stops the
 *      product — sending WhatsApp messages, editing bot content — so a non-payer
 *      cannot keep serving members for free. Erasing a member confers no product
 *      value on the church; it is pure cost. There is no incentive to exploit.
 *   2. The controller is deleting the controller's own data. The church is the
 *      *controlador*; we are the *operador*. Withholding a controller's delete
 *      button over a billing dispute is the operator asserting control over the
 *      controller's data — the wrong role in the wrong direction.
 *   3. The deadline runs against the church. Art. 18 VI plus Art. 19 II's 15 days,
 *      and the fine lands on the church. A vendor's invoice must never be the
 *      mechanism by which a controller misses a statutory deadline.
 *   4. Revocation is STILL checked, so a removed secretary is blocked exactly as
 *      today; a current secretary of a suspended church is still the controller's
 *      agent. Blast radius is one member, behind a typed APAGAR confirmation.
 *
 *  The honest residual — a church in a billing dispute can destroy its own member
 *  data — is true on every day the church is NOT suspended too, so suspension was
 *  never the control preventing it. The control that replaces it is visibility:
 *  every erasure is readable by the vendor in /owner. See listErasureSignals.
 *
 *  EXACTLY THREE FILES may call these. tests/privilege-boundary.test.ts asserts
 *  that set, so a fourth caller fails the suite rather than passing review. */
export async function requireDataRightsSession(): Promise<
  DataRightsIdentity | { blocked: 'revoked' }
> {
  const session = await requireSession();
  return verifyIdentity(session);
}

/** The route-handler variant. "No session" is a returnable sentinel instead of a
 *  redirect(), for the same reason checkWritableSession is: a route that let
 *  NEXT_REDIRECT escape would serialise a framework control-flow signal into its
 *  own JSON error body. */
export async function checkDataRightsSession(): Promise<
  DataRightsIdentity | { blocked: 'unauthenticated' | 'revoked' }
> {
  const session = await getSession();
  if (!isAuthenticated(session) || !session.churchId) return { blocked: 'unauthenticated' };
  return verifyIdentity({
    adminUserId: session.adminUserId!,
    churchId: session.churchId!,
    name: session.name ?? '',
    pwdAt: session.pwdAt,
  });
}

/** The pt-BR messages shown wherever access is refused. */
export const SUSPENDED_MESSAGE =
  'A assinatura desta igreja está suspensa. Entre em contato com o suporte para reativar o painel.';
export const REVOKED_MESSAGE =
  'Sua conta não tem mais acesso a este painel. Faça login novamente.';
export const UNAUTHENTICATED_MESSAGE =
  'Não autorizado. Faça login no painel e tente novamente.';

/** Maps the sentinel to its message, so every call site stays one line. */
export function blockedMessage(blocked: 'unauthenticated' | 'suspended' | 'revoked'): string {
  if (blocked === 'suspended') return SUSPENDED_MESSAGE;
  if (blocked === 'unauthenticated') return UNAUTHENTICATED_MESSAGE;
  return REVOKED_MESSAGE;
}
