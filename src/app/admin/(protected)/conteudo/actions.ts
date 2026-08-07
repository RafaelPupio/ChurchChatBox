'use server';

import { revalidatePath } from 'next/cache';
import { requireWritableSession, blockedMessage } from '@/lib/auth/writable';
import {
  countActiveMenuItems,
  listMenuItemsForAdmin,
  reorderMenuItems,
  updateMenuItem,
} from '@/lib/repo/menu-admin';
import { canActivateAnotherItem } from '@/lib/menu-admin-rules';

export interface ActionResult {
  error?: string;
}

/** Toggling to active is gated on the 10-row WhatsApp cap. updateMenuItem is
 *  church-scoped, so an id from another church is a silent no-op. */
export async function setItemActive(id: string, isActive: boolean): Promise<ActionResult> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  if (isActive) {
    const active = await countActiveMenuItems(churchId);
    if (!canActivateAnotherItem(active)) {
      return { error: 'O menu do WhatsApp permite no máximo 10 itens ativos. Oculte outro antes de ativar este.' };
    }
  }

  await updateMenuItem(id, churchId, { isActive });
  revalidatePath('/admin/conteudo');
  return {};
}

export async function moveItem(id: string, direction: 'up' | 'down'): Promise<ActionResult> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;
  const items = await listMenuItemsForAdmin(churchId);
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return {};

  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= items.length) return {};

  const ordered = items.map((i) => i.id);
  [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];

  await reorderMenuItems(churchId, ordered);
  revalidatePath('/admin/conteudo');
  return {};
}
