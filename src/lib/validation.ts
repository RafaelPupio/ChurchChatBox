import type { MenuItemKind } from './types';

export function requireNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function validateLabel(label: string): string | null {
  return requireNonEmpty(label) ? null : 'O rótulo não pode ficar em branco.';
}

/** A content item with neither body nor image would make the bot send an empty
 *  WhatsApp message (a Graph API 400). Prayer/human items carry no body. */
export function validateMenuItemContent(
  kind: MenuItemKind,
  bodyText: string,
  imageUrl: string | null,
): string | null {
  if (kind !== 'content') return null;
  if (requireNonEmpty(bodyText) || (imageUrl && imageUrl.length > 0)) return null;
  return 'Um item de conteúdo precisa de um texto ou de uma imagem.';
}

export function validateChurchText(value: string): string | null {
  return requireNonEmpty(value) ? null : 'Este texto não pode ficar em branco.';
}
