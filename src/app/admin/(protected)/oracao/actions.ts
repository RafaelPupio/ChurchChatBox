'use server';

import { revalidatePath } from 'next/cache';
import { requireWritableSession, blockedMessage } from '@/lib/auth/writable';
import { updatePrayerStatus } from '@/lib/repo/prayer-admin';

export interface PrayerActionResult {
  error?: string;
}

export async function setPrayerStatus(id: string, status: 'novo' | 'orado'): Promise<PrayerActionResult> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;
  try {
    await updatePrayerStatus(id, churchId, status);
  } catch (error) {
    console.error('Prayer status update failed', error);
    return { error: 'Não foi possível atualizar o status. Tente novamente.' };
  }
  revalidatePath('/admin/oracao');
  return {};
}
