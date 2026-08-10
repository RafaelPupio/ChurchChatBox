'use server';

import { revalidatePath } from 'next/cache';
import { requireReadableSession, requireWritableSession, blockedMessage, REVOKED_MESSAGE } from '@/lib/auth/writable';
import { updateChurch } from '@/lib/repo/church-admin';
import { createAdmin, deleteAdmin, findAdminById, findAdminByEmail, updateAdminPassword } from '@/lib/repo/admin';
import { invalidateResetTokensFor } from '@/lib/repo/password-reset';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getSession } from '@/lib/auth/session';
import {
  validateButtonLabel,
  validateChurchText,
  validateLabel,
  validateNewPassword,
} from '@/lib/validation';

export interface ConfigResult {
  error?: string;
  ok?: boolean;
}

// The bot-text columns a church always has, validated by validateChurchText.
// name uses validateLabel; menuButtonLabel uses validateButtonLabel (Meta's
// 20-char interactive-list button cap) — both are validated separately below.
const TEXT_FIELDS = [
  'greetingText', 'menuHeaderText', 'fallbackText',
  'unsupportedMediaText', 'errorText', 'prayerPromptText', 'prayerThanksText',
  'handoffText', 'handoffClosedText', 'courtesyText',
] as const;

export async function saveTexts(_prev: ConfigResult, formData: FormData): Promise<ConfigResult> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const name = String(formData.get('name') ?? '').trim();
  const nameError = validateLabel(name);
  if (nameError) return { error: `Nome da igreja: ${nameError}` };

  const menuButtonLabel = String(formData.get('menuButtonLabel') ?? '');
  const buttonError = validateButtonLabel(menuButtonLabel);
  if (buttonError) return { error: `Rótulo do botão: ${buttonError}` };

  const fields: Record<string, string> = { name, menuButtonLabel };
  for (const key of TEXT_FIELDS) {
    const value = String(formData.get(key) ?? '');
    const err = validateChurchText(value);
    if (err) return { error: `Há um campo em branco ou muito longo. Revise os textos do bot.` };
    fields[key] = value;
  }

  await updateChurch(churchId, fields);
  revalidatePath('/admin/configuracoes');
  return { ok: true };
}

export async function addStaff(_prev: ConfigResult, formData: FormData): Promise<ConfigResult> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '').trim();

  if (!email || !password) return { error: 'Informe e-mail e senha.' };
  // Same validator as the reset and change-password flows: a length rule enforced
  // when an account is created but not when its password is replaced is not a rule.
  // Passed twice because this form has no confirmation field.
  const weak = validateNewPassword(password, password);
  if (weak) return { error: weak };
  if (await findAdminByEmail(email)) return { error: 'Já existe uma conta com esse e-mail.' };

  await createAdmin({ churchId, email, passwordHash: await hashPassword(password), name: name || null });
  revalidatePath('/admin/configuracoes');
  return { ok: true };
}

/** Change your own password.
 *
 *  Guarded by requireReadableSession, NOT requireWritableSession, and the
 *  difference is deliberate. The writable guard refuses a suspended church,
 *  because suspension makes the panel read-only. But this is not a write to
 *  church data — it is an account-security operation on the person's own login,
 *  and tying it to the church's billing status would mean a secretary who believes
 *  her password is compromised is told to settle an invoice first. The public
 *  reset flow does not check church status either, so blocking it here would only
 *  push her through her inbox to reach the same outcome.
 *
 *  The readable guard still re-checks that the admin exists, still belongs to this
 *  church, and still matches the session's password epoch. */
export async function changePassword(_prev: ConfigResult, formData: FormData): Promise<ConfigResult> {
  const { adminUserId } = await requireReadableSession();

  const current = String(formData.get('currentPassword') ?? '');
  const password = String(formData.get('newPassword') ?? '');
  const confirmation = String(formData.get('confirmPassword') ?? '');

  if (!current) return { error: 'Informe a sua senha atual.' };

  const invalid = validateNewPassword(password, confirmation);
  if (invalid) return { error: invalid };

  const admin = await findAdminById(adminUserId);
  if (!admin) return { error: REVOKED_MESSAGE };

  // The current password is required so that a session someone walked away from —
  // or one an attacker is already holding — cannot be used to lock the real owner
  // out of her own account.
  if (!(await verifyPassword(current, admin.passwordHash))) {
    return { error: 'A senha atual não confere. Tente de novo.' };
  }

  if (await verifyPassword(password, admin.passwordHash)) {
    return { error: 'A nova senha precisa ser diferente da atual.' };
  }

  // Before the write, for the same reason as the reset flow: with no transactions
  // available, an interruption here must leave no live reset link behind. See
  // invalidateResetTokensFor.
  await invalidateResetTokensFor(adminUserId);

  const changedAt = await updateAdminPassword(adminUserId, await hashPassword(password), new Date());
  // The account was removed between the check above and this write. Nothing was
  // stored, so say so rather than re-sealing a cookie for an account that is gone.
  if (!changedAt) return { error: REVOKED_MESSAGE };

  // Re-seal THIS session with the new epoch. Without it the guard she meets on the
  // very next click would find her own cookie stale and bounce her to the login
  // page — which to a volunteer looks exactly like the change having failed. Every
  // OTHER session, on every other device, is now stale and stays stale.
  const session = await getSession();
  session.pwdAt = changedAt.getTime();
  await session.save();

  revalidatePath('/admin/configuracoes');
  return { ok: true };
}

export async function removeStaff(id: string): Promise<ConfigResult> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { adminUserId, churchId } = session;
  if (id === adminUserId) return { error: 'Você não pode remover a sua própria conta.' };
  await deleteAdmin(id, churchId); // church-scoped: cannot remove another church's staff by id
  revalidatePath('/admin/configuracoes');
  return { ok: true };
}
