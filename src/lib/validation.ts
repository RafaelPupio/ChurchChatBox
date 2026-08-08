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

/** Matches the floor `addStaff` has always applied. Deliberately a length rule
 *  with no character-class requirements: forced symbols and digits push people
 *  towards "Igreja2024!" and towards writing the result on a note stuck to the
 *  secretariat monitor, which is the actual threat model for a shared church
 *  computer. */
export const PASSWORD_MIN = 8;

/** bcrypt silently ignores everything past the 72th BYTE of its input. A user who
 *  chose a long passphrase would have it truncated without being told, and the
 *  part they trusted for their security would not exist. Counted in bytes, not
 *  characters, because "senha" costs 5 bytes and "senhã" costs 6. */
export const PASSWORD_MAX_BYTES = 72;

/** The one place the password rules live, so the reset flow, the change-password
 *  form and addStaff cannot drift apart — a rule enforced when a password is
 *  created but not when it is reset is a rule that does not exist. */
export function validateNewPassword(password: string, confirmation: string): string | null {
  if (!password) return 'Escolha uma nova senha.';
  if (password.length < PASSWORD_MIN) {
    return `A senha precisa ter ao menos ${PASSWORD_MIN} caracteres.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return 'Essa senha é longa demais. Escolha uma um pouco mais curta.';
  }
  if (password !== confirmation) {
    return 'As duas senhas não são iguais. Digite a mesma senha nos dois campos.';
  }
  return null;
}

export function validateChurchText(value: string): string | null {
  if (!requireNonEmpty(value)) return 'Este texto não pode ficar em branco.';
  if (value.length > CHURCH_TEXT_MAX) {
    return `Este texto é muito longo (máximo ${CHURCH_TEXT_MAX} caracteres).`;
  }
  return null;
}
