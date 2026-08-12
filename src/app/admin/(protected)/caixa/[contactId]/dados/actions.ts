'use server';

import { revalidatePath } from 'next/cache';
import { blockedMessage, requireDataRightsSession } from '@/lib/auth/writable';
import { hashPhone } from '@/lib/erasure-hash';
import {
  completeErasureRecord,
  findErasureByContact,
  openSubjectErasure,
} from '@/lib/repo/erasure';
import {
  countMemberRows,
  deleteMember,
  loadMemberSubject,
  renameContact,
} from '@/lib/repo/member-data';

/** Art. 18 III and VI. Both actions use requireDataRightsSession, which
 *  deliberately does NOT check suspension — see the long comment on that guard.
 *  This file is one of exactly THREE permitted callers; a fourth fails
 *  tests/privilege-boundary.test.ts. */

export type DeleteResult =
  | { ok: true; recordedAt: Date }
  | { alreadyDeleted: true }
  | { pending: true; since: Date }
  | { error: string };

const RECORD_FAILED =
  'Não foi possível registrar o comprovante de exclusão. Nada foi apagado — tente novamente.';
const DELETE_FAILED_AFTER_RECORD =
  'A exclusão foi iniciada mas não terminou. Ela ficou marcada como pendente e será concluída automaticamente; você também pode tentar de novo agora.';
const NOT_FOUND = 'Conversa não encontrada.';

export async function deleteMemberData(
  contactId: string,
  _prev: DeleteResult | Record<string, never>,
  formData: FormData,
): Promise<DeleteResult> {
  const session = await requireDataRightsSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  // EMAIL, not name. The receipt must survive the staff member leaving the church,
  // and it is read back as "· por {email}" in Configurações.
  const { churchId, email } = session;

  // Nothing is read or written before the confirmation. A destructive action must
  // not have side effects on the path where the user got the confirmation wrong.
  if (formData.get('confirm') !== 'APAGAR') {
    return { error: 'Escreva APAGAR para confirmar.' };
  }

  const contact = await loadMemberSubject(churchId, contactId);
  const counts = contact
    ? await countMemberRows(churchId, contactId)
    : { messages: 0, prayers: 0, prayersNovo: 0 };

  let opened: { id: string; createdAt: Date } | null = null;
  if (contact) {
    try {
      opened = await openSubjectErasure({
        churchId,
        contactId,
        // Pure, in memory, never logged. Null when the secret is unset — the
        // erasure still proceeds.
        phoneHash: hashPhone(contact.phone),
        performedByEmail: email,
        messages: counts.messages,
        prayers: counts.prayers,
      });
    } catch {
      // Both writes hit the same database. If the receipt cannot be written the
      // delete would not have committed either, so there is no state to reconcile.
      return { error: RECORD_FAILED };
    }
  }

  // --- This call owns the erasure.
  if (opened) {
    try {
      await deleteMember(churchId, contactId);
      // Completed even on 0 rows: what the record asserts — this contact's data is
      // not in the database — is true either way, and a pending row would be an
      // alarm about an already-correct state.
      await completeErasureRecord(opened.id, churchId);
    } catch {
      return { error: DELETE_FAILED_AFTER_RECORD };
    }
    revalidatePath('/admin/caixa');
    return { ok: true, recordedAt: opened.createdAt };
  }

  // --- Zero rows inserted. Three possibilities, and the existing record says which.
  const existing = await findErasureByContact(churchId, contactId);
  if (!existing) return { error: NOT_FOUND };

  if (existing.status === 'done') {
    // The double-click, or a second secretary. No second record was written —
    // the partial unique index made that impossible.
    return { alreadyDeleted: true };
  }

  // A previous attempt opened a receipt and failed to delete. deleteMember is
  // idempotent, so retrying is always safe.
  try {
    await deleteMember(churchId, contactId);
    await completeErasureRecord(existing.id, churchId);
    revalidatePath('/admin/caixa');
    return { ok: true, recordedAt: existing.createdAt };
  } catch {
    return { pending: true, since: existing.createdAt };
  }
}

export type RenameResult = { ok?: string; error?: string };

/** Art. 18 III. Durable: findOrCreateContact returns an existing row untouched and
 *  no code path writes contact.name after creation, so this survives the member's
 *  next inbound message. Message and prayer bodies are deliberately NOT editable —
 *  a conversation log is a record of an event, and letting a church rewrite what a
 *  member said destroys the only value it has. */
export async function renameMember(
  contactId: string,
  _prev: RenameResult,
  formData: FormData,
): Promise<RenameResult> {
  const session = await requireDataRightsSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'O nome não pode ficar em branco.' };

  const updated = await renameContact(session.churchId, contactId, name);
  if (updated === 0) return { error: NOT_FOUND };

  revalidatePath(`/admin/caixa/${contactId}`);
  return { ok: 'Nome atualizado.' };
}
