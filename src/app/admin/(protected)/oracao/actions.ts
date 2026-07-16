'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { updatePrayerStatus } from '@/lib/repo/prayer-admin';

export interface PrayerActionResult {
  error?: string;
}

export async function setPrayerStatus(id: string, status: 'novo' | 'orado'): Promise<PrayerActionResult> {
  const { churchId } = await requireSession();
  await updatePrayerStatus(id, churchId, status);
  revalidatePath('/admin/oracao');
  return {};
}
