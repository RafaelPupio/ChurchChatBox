import type { MenuItemKind } from './types';

/** Meta's interactive-list button (`action.button`) caps at 20 characters. */
export const MENU_BUTTON_MAX = 20;
/** Safe for every bot-text destination: list `body.text` caps at 1024, plain
 *  text messages at 4096 — 1024 is the tightest limit any of these values hits. */
export const CHURCH_TEXT_MAX = 1024;

export function requireNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function validateLabel(label: string): string | null {
  return requireNonEmpty(label) ? null : 'O rótulo não pode ficar em branco.';
}

/** The WhatsApp interactive-list button label. A value over Meta's 20-char cap
 *  makes every menu send fail (Graph 400), silently killing the bot's core
 *  feature — so this is stricter than the generic bot-text validator. */
export function validateButtonLabel(value: string): string | null {
  if (!requireNonEmpty(value)) return 'O rótulo do botão não pode ficar em branco.';
  if (value.trim().length > MENU_BUTTON_MAX) {
    return `O rótulo do botão deve ter no máximo ${MENU_BUTTON_MAX} caracteres.`;
  }
  return null;
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
  if (!requireNonEmpty(value)) return 'Este texto não pode ficar em branco.';
  if (value.length > CHURCH_TEXT_MAX) {
    return `Este texto é muito longo (máximo ${CHURCH_TEXT_MAX} caracteres).`;
  }
  return null;
}
