'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { setChurchCredentials, setChurchStatus } from '@/lib/repo/platform';
import type { ChurchStatus } from '@/lib/church-status';

export interface OwnerActionResult {
  error?: string;
  ok?: boolean;
}

export async function saveCredentials(
  churchId: string,
  _prev: OwnerActionResult,
  formData: FormData,
): Promise<OwnerActionResult> {
  await requireOwnerSession();

  try {
    // Secrets are blank unless deliberately retyped, so blank means "keep".
    // phoneNumberId / webhookVerifyToken are always written (empty → null) so a
    // number can be released from one church and assigned to another.
    await setChurchCredentials(churchId, {
      phoneNumberId: String(formData.get('phoneNumberId') ?? '').trim(),
      webhookVerifyToken: String(formData.get('webhookVerifyToken') ?? '').trim(),
      accessToken: String(formData.get('accessToken') ?? '').trim() || undefined,
      appSecret: String(formData.get('appSecret') ?? '').trim() || undefined,
    });
  } catch (error) {
    console.error('saveCredentials failed', error);
    // phone_number_id is globally unique, and pasting one that already belongs to
    // another church is the likeliest mistake here — name it rather than showing
    // a generic failure.
    const message = String(error instanceof Error ? error.message : '');
    return {
      error: message.includes('church_phone_number_id_uq')
        ? 'Este Phone Number ID já está em uso por outra igreja. Libere-o na outra igreja primeiro.'
        : 'Não foi possível salvar as credenciais. Tente novamente.',
    };
  }

  revalidatePath(`/owner/${churchId}`);
  revalidatePath('/owner');
  return { ok: true };
}

export async function changeStatus(churchId: string, status: ChurchStatus): Promise<OwnerActionResult> {
  await requireOwnerSession();
  try {
    await setChurchStatus(churchId, status);
  } catch (error) {
    console.error('changeStatus failed', error);
    return { error: 'Não foi possível alterar a situação. Tente novamente.' };
  }
  revalidatePath(`/owner/${churchId}`);
  revalidatePath('/owner');
  return { ok: true };
}
