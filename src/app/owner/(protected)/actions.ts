'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOwnerSession, requireOwnerSession } from '@/lib/auth/owner-session';
import { provisionChurch } from '@/lib/provisioning';

export async function ownerLogout(): Promise<void> {
  const session = await getOwnerSession();
  session.destroy();
  redirect('/owner/login');
}

export interface NewChurchState {
  error?: string;
  created?: string;
}

/** The owner-console path that brings a church into existence. Without this (or
 *  `npm run create-church`) provisionChurch would have no caller and church #2
 *  could not exist — db:seed only ever creates the first one. */
export async function createChurch(_prev: NewChurchState, formData: FormData): Promise<NewChurchState> {
  await requireOwnerSession();

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!name || !email || !password) return { error: 'Preencha nome, e-mail e senha.' };
  if (password.length < 8) return { error: 'A senha precisa ter ao menos 8 caracteres.' };

  try {
    await provisionChurch(name, email, password);
  } catch (error) {
    console.error('createChurch failed', error);
    const message = error instanceof Error ? error.message : '';
    return {
      error: message.includes('already exists')
        ? 'Já existe uma conta com esse e-mail. Cada e-mail pertence a uma única igreja.'
        : 'Não foi possível criar a igreja. Tente novamente.',
    };
  }

  revalidatePath('/owner');
  return { created: name };
}
