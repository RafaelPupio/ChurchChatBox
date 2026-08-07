'use server';

import { redirect } from 'next/navigation';
import { getOwnerSession } from '@/lib/auth/owner-session';

export async function ownerLogout(): Promise<void> {
  const session = await getOwnerSession();
  session.destroy();
  redirect('/owner/login');
}
