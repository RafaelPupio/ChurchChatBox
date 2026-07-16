import { getIronSession, type IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export interface SessionData {
  adminUserId?: string;
  churchId?: string;
  name?: string;
}

const COOKIE_NAME = 'sv_admin';

/** Pure guard used by both the layout and every action. */
export function isAuthenticated(session: Pick<SessionData, 'adminUserId'>): boolean {
  return typeof session.adminUserId === 'string' && session.adminUserId.length > 0;
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
