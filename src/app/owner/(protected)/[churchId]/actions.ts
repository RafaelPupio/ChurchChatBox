'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { setChurchCredentials, setChurchStatus } from '@/lib/repo/platform';
import { countMenuItems, createMenuItem, listMenuItemsForAdmin, updateMenuItem } from '@/lib/repo/menu-admin';
import { PRIVACY_ITEM, PRIVACY_ITEM_PREVIOUS_BODIES } from '@/lib/church-defaults';
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

/** Repairs a church whose provisioning committed the church and admin but lost
 *  the Privacidade menu item (provisionChurch returns menuSeeded: false for
 *  exactly that case, and no longer rolls the church back over it).
 *
 *  This is an LGPD transparency gap, not cosmetics: without it a member has no
 *  way inside WhatsApp to read what the church stores about them. */
export async function seedPrivacyItem(churchId: string): Promise<OwnerActionResult> {
  await requireOwnerSession();

  try {
    // Re-check server-side rather than trusting the button's presence: two owner
    // tabs open on the same church must not produce two Privacidade items.
    if ((await countMenuItems(churchId)) > 0) {
      return { error: 'Esta igreja já tem itens no menu. Recarregue a página.' };
    }

    await createMenuItem({
      churchId,
      position: PRIVACY_ITEM.position,
      label: PRIVACY_ITEM.label,
      bodyText: PRIVACY_ITEM.bodyText,
      imageUrl: null,
      isActive: true,
      kind: PRIVACY_ITEM.kind,
    });
  } catch (error) {
    console.error('seedPrivacyItem failed', error);
    return { error: 'Não foi possível criar o item de Privacidade. Tente novamente.' };
  }

  revalidatePath(`/owner/${churchId}`);
  revalidatePath('/owner');
  return { ok: true };
}

/** Rewrites a church's 🔒 Privacidade body to the current default, and ONLY when
 *  its current body is byte-identical to a body we once seeded.
 *
 *  A church that edited its own text is never overwritten: the vendor may replace
 *  vendor-authored text, never the controller's own words. Churches whose text was
 *  edited simply report "edited" so Rafael can call them. */
export async function updatePrivacyText(churchId: string): Promise<{ ok?: string; error?: string }> {
  await requireOwnerSession();

  const items = await listMenuItemsForAdmin(churchId);
  const item = items.find((i) => i.label === PRIVACY_ITEM.label);
  if (!item) return { error: 'Esta igreja não tem o item de Privacidade. Use "Recriar item de Privacidade".' };

  if (item.bodyText === PRIVACY_ITEM.bodyText) {
    return { ok: 'Esta igreja já está com o texto mais recente.' };
  }
  if (!PRIVACY_ITEM_PREVIOUS_BODIES.includes(item.bodyText)) {
    return { error: 'Esta igreja editou o próprio texto de Privacidade. Fale com ela antes de alterar.' };
  }

  try {
    await updateMenuItem(item.id, churchId, { bodyText: PRIVACY_ITEM.bodyText });
  } catch {
    return { error: 'Não foi possível atualizar o texto. Tente novamente.' };
  }
  revalidatePath(`/owner/${churchId}`);
  return { ok: 'Texto de Privacidade atualizado.' };
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
