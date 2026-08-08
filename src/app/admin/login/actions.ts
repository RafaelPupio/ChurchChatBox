'use server';

import { redirect } from 'next/navigation';
import { findAdminByEmail } from '@/lib/repo/admin';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getSession } from '@/lib/auth/session';

export interface LoginState {
  error?: string;
}

// A fixed-cost decoy hash so an unknown email still incurs a real bcrypt compare —
// response time must not reveal whether an email exists. Computed once, lazily.
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('timing-decoy-value');
  return decoyHash;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Informe e-mail e senha.' };
  }

  const admin = await findAdminByEmail(email);
  // Always run exactly one bcrypt compare — against the real hash, or the decoy
  // of the same cost when the email is unknown — so timing never leaks existence.
  const ok = await verifyPassword(password, admin?.passwordHash ?? (await getDecoyHash()));

  if (!admin || !ok) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  const session = await getSession();
  session.kind = 'admin';
  session.adminUserId = admin.id;
  session.churchId = admin.churchId;
  session.name = admin.name ?? '';
  // Seals the password epoch into the cookie. Every guard compares it against the
  // live row, so a later password change invalidates this session — see
  // sessionMatchesPassword. Omitting it here would make every cookie this action
  // issues instantly stale, i.e. login would appear to succeed and then bounce
  // straight back to this page.
  session.pwdAt = admin.passwordChangedAt.getTime();
  await session.save();

  redirect('/admin/conteudo');
}
