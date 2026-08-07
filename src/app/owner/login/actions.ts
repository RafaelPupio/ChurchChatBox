'use server';

import { redirect } from 'next/navigation';
import { findOwnerByEmail } from '@/lib/repo/owner';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getOwnerSession } from '@/lib/auth/owner-session';

export interface OwnerLoginState {
  error?: string;
}

// Fixed-cost decoy so an unknown email still incurs a real bcrypt compare —
// response time must not reveal whether an owner account exists.
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('timing-decoy-value');
  return decoyHash;
}

export async function ownerLogin(_prev: OwnerLoginState, formData: FormData): Promise<OwnerLoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Informe e-mail e senha.' };
  }

  const owner = await findOwnerByEmail(email);
  const ok = await verifyPassword(password, owner?.passwordHash ?? (await getDecoyHash()));

  if (!owner || !ok) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  const session = await getOwnerSession();
  session.kind = 'owner';
  session.ownerUserId = owner.id;
  session.name = owner.name ?? '';
  await session.save();

  redirect('/owner');
}
