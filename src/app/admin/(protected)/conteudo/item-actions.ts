'use server';

import { redirect } from 'next/navigation';
import { requireWritableSession, blockedMessage } from '@/lib/auth/writable';
import {
  countActiveMenuItems,
  createMenuItem,
  getNextPosition,
  listMenuItemsForAdmin,
  updateMenuItem,
} from '@/lib/repo/menu-admin';
import { canActivateAnotherItem } from '@/lib/menu-admin-rules';
import { validateLabel, validateMenuItemContent } from '@/lib/validation';
import type { MenuItemKind } from '@/lib/types';

export interface ItemFormState {
  error?: string;
}

function parseKind(value: FormDataEntryValue | null): MenuItemKind {
  return value === 'prayer' || value === 'human' ? value : 'content';
}

/** The browser uploads the image straight to Vercel Blob (Task 8) and submits only
 *  the resulting URL string in `imageUrl` — no file transits this Server Action. */
function resolveImageUrl(formData: FormData, existing: string | null): string | null {
  const uploaded = String(formData.get('imageUrl') ?? '').trim();
  if (uploaded) return uploaded;
  if (formData.get('removeImage') === 'on') return null;
  return existing;
}

export async function createItem(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const label = String(formData.get('label') ?? '').trim();
  const bodyText = String(formData.get('bodyText') ?? '');
  const kind = parseKind(formData.get('kind'));

  const labelError = validateLabel(label);
  if (labelError) return { error: labelError };

  const imageUrl = resolveImageUrl(formData, null);

  const contentError = validateMenuItemContent(kind, bodyText, imageUrl);
  if (contentError) return { error: contentError };

  // A new item goes live only if the menu is not already at 10 active rows;
  // otherwise it is saved hidden, never silently pushing the WhatsApp list over.
  const active = await countActiveMenuItems(churchId);
  const isActive = canActivateAnotherItem(active);

  const position = await getNextPosition(churchId);
  await createMenuItem({ churchId, position, label, bodyText, imageUrl, isActive, kind });
  redirect('/admin/conteudo');
}

export async function editItem(id: string, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const items = await listMenuItemsForAdmin(churchId);
  const current = items.find((i) => i.id === id);
  if (!current) return { error: 'Item não encontrado.' };

  const label = String(formData.get('label') ?? '').trim();
  const bodyText = String(formData.get('bodyText') ?? '');
  const kind = parseKind(formData.get('kind'));

  const labelError = validateLabel(label);
  if (labelError) return { error: labelError };

  const imageUrl = resolveImageUrl(formData, current.imageUrl);

  const contentError = validateMenuItemContent(kind, bodyText, imageUrl);
  if (contentError) return { error: contentError };

  await updateMenuItem(id, churchId, { label, bodyText, kind, imageUrl });
  redirect('/admin/conteudo');
}
