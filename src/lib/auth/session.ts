import { getIronSession, type IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export interface SessionData {
  kind?: 'admin';
  adminUserId?: string;
  churchId?: string;
  name?: string;
  /** admin_user.password_changed_at at the moment this cookie was sealed, in ms.
   *  Compared against the live row by the guards in src/lib/auth/writable.ts —
   *  this is what makes a password change end other sessions. See
   *  sessionMatchesPassword below. */
  pwdAt?: number;
}

const COOKIE_NAME = 'sv_admin';

/** 8 hours — roughly one working day at the church office.
 *
 *  iron-session's default is 14 days, which is far too long for a panel holding
 *  member phone numbers, message history and prayer requests: a stolen or
 *  forgotten session on a shared secretariat computer stayed valid for a
 *  fortnight. The per-request re-check in src/lib/auth/writable.ts closes
 *  *revocation*, but only this bounds a cookie nobody ever revoked. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Pure guard used by both the layout and every action. */
export function isAuthenticated(session: Pick<SessionData, 'kind' | 'adminUserId'>): boolean {
  return session.kind === 'admin' && typeof session.adminUserId === 'string' && session.adminUserId.length > 0;
}

/** Whether this cookie was issued for the password the account currently has.
 *
 *  iron-session keeps no server-side record of a session — the cookie IS the
 *  session, sealed and handed to the browser — so there is nothing to delete when
 *  someone changes their password. Without this comparison, a secretary who
 *  resets her password precisely BECAUSE she thinks someone else has it would
 *  leave that person's session working for the rest of its 8h TTL. The reset
 *  would change the lock and leave the intruder inside.
 *
 *  A missing pwdAt is REJECTED, not grandfathered. It means a cookie sealed by a
 *  build from before this field existed, and treating those as valid would leave
 *  a documented bypass sitting in the codebase forever, one careless refactor away
 *  from applying to every session. The cost is that everyone logged in at deploy
 *  time logs in once more.
 *
 *  Exact equality on the millisecond, not a "newer than" comparison: the value is
 *  copied from the row, so any difference at all means this cookie predates the
 *  current password. */
export function sessionMatchesPassword(
  session: Pick<SessionData, 'pwdAt'>,
  passwordChangedAt: Date,
): boolean {
  return typeof session.pwdAt === 'number' && session.pwdAt === passwordChangedAt.getTime();
}

/** Read SESSION_SECRET lazily so `next build` never requires it. */
function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters.');
  }
  return secret;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), {
    password: sessionPassword(),
    cookieName: COOKIE_NAME,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  });
}

/** What the cookie claims: the identity, plus the password epoch the guards need
 *  to decide whether that claim is still current. `pwdAt` is optional here and
 *  not in AdminIdentity on purpose — it is an input to the guards, never part of
 *  the identity they hand to application code. */
export interface SessionClaims {
  adminUserId: string;
  churchId: string;
  name: string;
  pwdAt?: number;
}

/** For Server Actions: returns the authenticated identity, or redirects to login.
 *  redirect() throws a control-flow signal, so nothing after it runs. */
export async function requireSession(): Promise<SessionClaims> {
  const session = await getSession();
  if (!isAuthenticated(session) || !session.churchId) {
    redirect('/admin/login');
  }
  return {
    adminUserId: session.adminUserId!,
    churchId: session.churchId!,
    name: session.name ?? '',
    pwdAt: session.pwdAt,
  };
}
