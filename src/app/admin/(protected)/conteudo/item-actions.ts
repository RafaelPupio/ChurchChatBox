'use server';

// No `revalidatePath` import: every write in this file ends in a redirect, which
// re-renders the destination on the server on its own.
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
import { BEHAVIOUR_ITEM, type BehaviourKind } from '@/lib/behaviour-items';
import { validateLabel, validateMenuItemContent } from '@/lib/validation';

/** Unchanged from main. There is deliberately NO `notice` field: a message about
 *  a write that succeeded must be rendered by the LIST PAGE after the redirect,
 *  never returned into the component that triggered the write. See addBehaviourItem. */
export interface ItemFormState {
  error?: string;
}

/** The browser uploads the image straight to Vercel Blob and submits only the
 *  resulting URL string in `imageUrl` — no file transits this Server Action. */
function resolveImageUrl(formData: FormData, existing: string | null): string | null {
  const uploaded = String(formData.get('imageUrl') ?? '').trim();
  if (uploaded) return uploaded;
  if (formData.get('removeImage') === 'on') return null;
  return existing;
}

/** There is deliberately NO parseKind here any more, and no `kind` field is read
 *  from any FormData in this file.
 *
 *  Everything this form creates is a content item; the two behaviour kinds are
 *  created by addBehaviourItem below and never change afterwards. Reading a kind
 *  out of a request is exactly what made deleting the "Tipo" dropdown dangerous:
 *  parseKind returns 'content' for a missing field, so a prayer item's form
 *  submission would have silently converted it to a content item with an empty
 *  body — the bot stops asking for prayer requests, and nothing says so. */
export async function createItem(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const label = String(formData.get('label') ?? '').trim();
  const bodyText = String(formData.get('bodyText') ?? '');

  const labelError = validateLabel(label);
  if (labelError) return { error: labelError };

  const imageUrl = resolveImageUrl(formData, null);

  const contentError = validateMenuItemContent('content', bodyText, imageUrl);
  if (contentError) return { error: contentError };

  // A new item goes live only if the menu is not already at 10 active rows;
  // otherwise it is saved hidden, never silently pushing the WhatsApp list over.
  const active = await countActiveMenuItems(churchId);
  const isActive = canActivateAnotherItem(active);

  const position = await getNextPosition(churchId);
  const created = await createMenuItem({
    churchId, position, label, bodyText, imageUrl, isActive, kind: 'content',
  });

  // The id rides back in the URL so the list can name the item it just saved —
  // and, when the cap demoted it to hidden, say so at the one moment it matters.
  // Until now this redirected with no message at all: she pressed Criar, the
  // product did something other than what she asked, and the only explanation
  // was a paragraph at the top of a page she had already scrolled past. On a
  // phone the new row lands at the bottom of the list, below the fold.
  redirect(`/admin/conteudo?criado=${created.id}`);
}

export async function editItem(id: string, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const items = await listMenuItemsForAdmin(churchId);
  const current = items.find((i) => i.id === id);
  if (!current) return { error: 'Item não encontrado.' };

  const label = String(formData.get('label') ?? '').trim();
  const labelError = validateLabel(label);
  if (labelError) return { error: labelError };

  if (current.kind === 'content') {
    const bodyText = String(formData.get('bodyText') ?? '');
    const imageUrl = resolveImageUrl(formData, current.imageUrl);
    const contentError = validateMenuItemContent('content', bodyText, imageUrl);
    if (contentError) return { error: contentError };
    await updateMenuItem(id, churchId, { label, bodyText, imageUrl });
  } else {
    // A behaviour item's reply comes from church.prayerPromptText /
    // handoffText, so its row carries only a name. bodyText and imageUrl are
    // ABSENT from this payload rather than written as '': whatever an older
    // version of this form stored in those columns stays exactly as it is,
    // retrievable with a query even though the panel no longer shows it.
    //
    // `kind` is absent too, and that is the point of the whole task: it comes
    // from the row, never from the request, so no submission can change it.
    await updateMenuItem(id, churchId, { label });
  }

  redirect('/admin/conteudo');
}

/** The two items a church needs exactly one of, created by one tap from the list
 *  instead of by filling a form: their reply text lives in Configurações, so a
 *  form would only ever have collected a name the product already knows.
 *
 *  Idempotent by kind. The button that calls this stops rendering once the church
 *  has an item of that kind, but a button is not a lock — this re-check is what
 *  closes the double-tap and the two-open-tabs races.
 *
 *  It REDIRECTS on success, through the same `?criado=` the create form uses,
 *  instead of returning a message. That is not a style choice. The block holding
 *  these buttons renders only while `missingBehaviourKinds` is non-empty, so
 *  adding the LAST missing kind unmounts the very component a returned message
 *  would have to be displayed in: the church at ten active items would tap
 *  "+ Adicionar 💬 Falar com atendente", get an item that is not in the menu, and
 *  be told nothing — the exact silent demotion the message exists to prevent. The
 *  page survives the write; the component does not, so the page says it. */
export async function addBehaviourItem(kind: BehaviourKind): Promise<ItemFormState> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const items = await listMenuItemsForAdmin(churchId);
  // Double tap, or a second tab. Nothing was created, so there is nothing to
  // announce — show her the list with the item already in it.
  if (items.some((i) => i.kind === kind)) redirect('/admin/conteudo');

  const active = await countActiveMenuItems(churchId);
  const isActive = canActivateAnotherItem(active);
  const position = await getNextPosition(churchId);

  const created = await createMenuItem({
    churchId,
    position,
    label: BEHAVIOUR_ITEM[kind].defaultLabel,
    bodyText: '',
    imageUrl: null,
    isActive,
    kind,
  });

  // The list page names what was created and, when the 10-row cap left it out of
  // the menu, says so — one banner, one code path, shared with createItem.
  redirect(`/admin/conteudo?criado=${created.id}`);
}
