'use server';

import { revalidatePath } from 'next/cache';
import { requireWritableSession, blockedMessage } from '@/lib/auth/writable';
import {
  countActiveMenuItems,
  listMenuItemsForAdmin,
  reorderMenuItems,
  updateMenuItem,
} from '@/lib/repo/menu-admin';
import { canActivateAnotherItem, canHideItem } from '@/lib/menu-admin-rules';

export interface ActionResult {
  error?: string;
}

/** Both directions are gated now. Toggling to active is capped at the 10 rows a
 *  WhatsApp interactive list allows; toggling to hidden is floored at 1, because
 *  zero active rows makes buildListPayload throw MenuEmptyError and the bot then
 *  answers every member with body text and nothing to tap.
 *
 *  The count is safe to compare against the target directly: the list only offers
 *  "Tirar do menu" on rows that are currently active, so on the hide path the
 *  target is always one of the `active` items being counted.
 *
 *  updateMenuItem is church-scoped, so an id from another church is a silent
 *  no-op. */
export async function setItemActive(id: string, isActive: boolean): Promise<ActionResult> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const active = await countActiveMenuItems(churchId);

  if (isActive) {
    if (!canActivateAnotherItem(active)) {
      return {
        error:
          'O menu do WhatsApp mostra no máximo 10 opções, e as 10 já estão ocupadas. ' +
          'Tire outra opção do menu antes de colocar esta.',
      };
    }
  } else if (!canHideItem(active)) {
    return {
      error:
        'Esta é a única opção que está no menu. Se você tirar, quem escrever para a igreja não recebe ' +
        'nenhuma opção para tocar. Coloque outra opção no menu antes de tirar esta.',
    };
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
