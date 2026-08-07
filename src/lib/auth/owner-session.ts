import { getIronSession, type IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { findOwnerById } from '@/lib/repo/owner';

export interface OwnerSessionData {
  kind?: 'owner';
  ownerUserId?: string;
  name?: string;
}

/** A distinct cookie from the church panel's `sv_admin`.
 *
 *  The `kind` discriminator is load-bearing, not decoration: both sessions are
 *  sealed with the same SESSION_SECRET, and iron-session does not bind a seal to
 *  a cookie name — so a valid `sv_admin` value pasted into an `sv_owner` cookie
 *  unseals successfully. Without `kind`, the only thing rejecting it would be
 *  the church payload happening not to have an `ownerUserId` field, which one
 *  future rename would silently undo. */
const COOKIE_NAME = 'sv_owner';

/** Same 8 hours as the church panel, for a stronger reason: this cookie reaches
 *  every tenant's Meta credentials and every church's lifecycle switch. Left at
 *  iron-session's 14-day default, one stale laptop session is a platform-wide
 *  key. */
export const OWNER_SESSION_TTL_SECONDS = 8 * 60 * 60;

export function isOwnerAuthenticated(session: Pick<OwnerSessionData, 'kind' | 'ownerUserId'>): boolean {
  return session.kind === 'owner' && typeof session.ownerUserId === 'string' && session.ownerUserId.length > 0;
}

/** Read SESSION_SECRET lazily so `next build` never requires it. */
function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters.');
  }
  return secret;
}

export async function getOwnerSession(): Promise<IronSession<OwnerSessionData>> {
  return getIronSession<OwnerSessionData>(await cookies(), {
    password: sessionPassword(),
    cookieName: COOKIE_NAME,
    ttl: OWNER_SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  });
}

export async function requireOwnerSession(): Promise<{ ownerUserId: string; name: string }> {
  const session = await getOwnerSession();
  if (!isOwnerAuthenticated(session)) {
    redirect('/owner/login');
  }
  // The cookie proves who they were. Confirm the account still exists, so a
  // revoked owner loses access to every church's credentials immediately.
  const owner = await findOwnerById(session.ownerUserId!);
  if (!owner) {
    session.destroy();
    redirect('/owner/login');
  }
  return { ownerUserId: owner.id, name: owner.name ?? '' };
}
