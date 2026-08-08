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

/** Strips the guard-only claims off, so `pwdAt` never reaches application code. */
function identityOf(claims: SessionClaims): AdminIdentity {
  return { adminUserId: claims.adminUserId, churchId: claims.churchId, name: claims.name };
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
  const admin = await findAdminById(session.adminUserId);
  if (!admin || admin.churchId !== session.churchId) return { blocked: 'revoked' };

  // Same sentinel as a deleted admin: from the holder's point of view the account
  // this cookie names no longer accepts it, and the remedy is the same — log in.
  if (!sessionMatchesPassword(session, admin.passwordChangedAt)) return { blocked: 'revoked' };

  const church = await getChurchById(session.churchId);
  if (!church) return { blocked: 'revoked' };

  if (effectiveStatus(church.status, church.graceUntil, new Date()) === 'suspended') {
    return { blocked: 'suspended' };
  }

  return identityOf(session);
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
