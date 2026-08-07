import { getIronSession, type IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export interface SessionData {
  kind?: 'admin';
  adminUserId?: string;
  churchId?: string;
  name?: string;
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

/** For Server Actions: returns the authenticated identity, or redirects to login.
 *  redirect() throws a control-flow signal, so nothing after it runs. */
export async function requireSession(): Promise<{ adminUserId: string; churchId: string; name: string }> {
  const session = await getSession();
  if (!isAuthenticated(session) || !session.churchId) {
    redirect('/admin/login');
  }
  return {
    adminUserId: session.adminUserId!,
    churchId: session.churchId!,
    name: session.name ?? '',
  };
}
