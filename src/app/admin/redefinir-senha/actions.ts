'use server';

import { hashPassword } from '@/lib/auth/password';
import { LINK_UNUSABLE_MESSAGE } from '@/lib/auth/reset-messages';
import { hashResetToken } from '@/lib/auth/reset-token';
import { updateAdminPassword } from '@/lib/repo/admin';
import { consumeResetToken, invalidateResetTokensFor } from '@/lib/repo/password-reset';
import { validateNewPassword } from '@/lib/validation';

export interface ResetPasswordState {
  ok?: boolean;
  error?: string;
}

export async function resetPassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');

  if (!token) return { error: LINK_UNUSABLE_MESSAGE };

  // VALIDATE BEFORE CONSUMING. The token is single use, so checking it first would
  // mean a mistyped confirmation burns the link and sends a volunteer back to her
  // inbox to request another one. Nothing here touches the database, so it leaks
  // nothing about whether the token is real.
  const invalid = validateNewPassword(password, confirmation);
  if (invalid) return { error: invalid };

  const now = new Date();

  // Step 1 — claim the token. ONE atomic statement; see consumeResetToken. Two
  // browsers submitting the same link get exactly one winner.
  const adminUserId = await consumeResetToken(hashResetToken(token), now);
  if (!adminUserId) return { error: LINK_UNUSABLE_MESSAGE };

  // Step 2 — destroy every other outstanding link for this admin, BEFORE the new
  // password is written. neon-http has no transactions, so the ordering of these
  // two statements is the only thing deciding what an interruption between them
  // leaves behind, and this order leaves "no live links, password unchanged"
  // rather than "password changed, somebody else's link still works". See
  // invalidateResetTokensFor.
  await invalidateResetTokensFor(adminUserId);

  // Step 3 — the new password and the session-revocation epoch, in one statement.
  // Writing password_changed_at is what ends every session sealed under the old
  // password: an intruder holding a stolen cookie is refused at the next guard.
  const written = await updateAdminPassword(adminUserId, await hashPassword(password), now);

  // No row: the account was removed between claiming the token and this write.
  // Vanishingly rare — the FK cascade normally destroys the token with the admin —
  // but reporting success for a password nobody stored would leave someone certain
  // of a password that does not exist. Same generic message as every other failure.
  if (!written) return { error: LINK_UNUSABLE_MESSAGE };

  // Deliberately does NOT sign the visitor in. Whoever completed this proved only
  // that they can read one mailbox, and admin emails in this product are never
  // verified — so the last step is a normal login, which also confirms to her that
  // the new password really works.
  return { ok: true };
}
