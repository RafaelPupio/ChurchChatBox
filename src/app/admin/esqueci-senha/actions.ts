'use server';

import { appBaseUrl } from '@/lib/app-url';
import { RESET_REQUESTED_MESSAGE } from '@/lib/auth/reset-messages';
import {
  generateResetToken,
  hashResetToken,
  remainingFloorMs,
  resetLinkFor,
  resetTokenExpiresAt,
} from '@/lib/auth/reset-token';
import { sendPasswordResetEmail } from '@/lib/email';
import { findAdminByEmail } from '@/lib/repo/admin';
import { createResetToken } from '@/lib/repo/password-reset';

export interface ForgotPasswordState {
  sent?: boolean;
  error?: string;
}

/** RFC 5321's maximum. Anything longer cannot be an address, so it never reaches
 *  the database — but it still gets the identical message and the identical
 *  elapsed time as everything else. */
const EMAIL_MAX = 254;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const startedAt = Date.now();
  // Trim only, never lowercase: findAdminByEmail matches the column exactly, and
  // login/actions.ts does the same. Normalising on one side of that pair and not
  // the other would produce an account nobody can log into or nobody can recover.
  const email = String(formData.get('email') ?? '').trim();

  // Refusing a BLANK field is not an oracle — it says nothing about any account —
  // and silently answering "we sent it" to someone who submitted nothing would be
  // a lie with no upside. This returns before the floor because it does no lookup:
  // there is nothing here whose duration could leak.
  if (!email) return { error: 'Informe o seu e-mail.' };

  try {
    if (email.length <= EMAIL_MAX) {
      const admin = await findAdminByEmail(email);
      if (admin) {
        const now = new Date();
        const token = generateResetToken();
        // Only the hash is stored. The plaintext lives in this function's scope
        // and in the email, and nowhere else — least of all the database.
        const created = await createResetToken({
          adminUserId: admin.id,
          tokenHash: hashResetToken(token),
          expiresAt: resetTokenExpiresAt(now),
          now,
        });
        // `created` is false when the throttle refused. The response does not
        // change; the caller is simply not sent a second message this minute.
        if (created) {
          await sendPasswordResetEmail(admin.email, resetLinkFor(appBaseUrl(), token));
        }
      }
    }
  } catch (error) {
    // A database or provider failure must not become the difference between the
    // two branches. Logged for the operator, invisible to the visitor.
    console.error('[reset] request failed:', error);
  }

  // Both branches leave through here, having taken the same wall-clock time. See
  // remainingFloorMs for why this is a floor rather than the login action's decoy
  // hash, and for the condition under which it stops working.
  await sleep(remainingFloorMs(Date.now() - startedAt));
  return { sent: true };
}
