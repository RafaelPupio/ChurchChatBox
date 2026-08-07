import { requireSession } from '@/lib/auth/session';
import { findAdminById } from '@/lib/repo/admin';
import { getChurchById } from '@/lib/repo/church-admin';
import { effectiveStatus } from '@/lib/church-status';

/** Session, plus two checks the session cookie alone cannot make.
 *
 *  1. The admin still exists and still belongs to this church. A cookie proves
 *     who someone WAS; `removeStaff` can delete their row, and a removed
 *     secretary must not keep writing to the church's inbox until their cookie
 *     happens to expire.
 *  2. The church is not suspended.
 *
 *  Returns a sentinel rather than throwing, so each action surfaces a pt-BR
 *  message in its own result shape. */
export async function requireWritableSession(): Promise<
  { adminUserId: string; churchId: string; name: string } | { blocked: 'suspended' | 'revoked' }
> {
  const session = await requireSession();

  const admin = await findAdminById(session.adminUserId);
  if (!admin || admin.churchId !== session.churchId) return { blocked: 'revoked' };

  const church = await getChurchById(session.churchId);
  if (!church) return { blocked: 'revoked' };

  if (effectiveStatus(church.status, church.graceUntil, new Date()) === 'suspended') {
    return { blocked: 'suspended' };
  }

  return session;
}

/** The pt-BR messages shown wherever a write is refused. */
export const SUSPENDED_MESSAGE =
  'A assinatura desta igreja está suspensa. Entre em contato com o suporte para reativar o painel.';
export const REVOKED_MESSAGE =
  'Sua conta não tem mais acesso a este painel. Faça login novamente.';

/** Maps the sentinel to its message, so every call site stays one line. */
export function blockedMessage(blocked: 'suspended' | 'revoked'): string {
  return blocked === 'suspended' ? SUSPENDED_MESSAGE : REVOKED_MESSAGE;
}
