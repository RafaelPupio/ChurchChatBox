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
  type MemberCounts,
  type MemberSubject,
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
// Distinct from RECORD_FAILED on purpose: this guards a READ (is there already a
// receipt for this contact?), not the write RECORD_FAILED describes. Reusing that
// string here was not wrong — nothing has been written on this branch either way,
// so "nada foi apagado" stays true — but "não foi possível registrar" claims this
// call was trying to register something, when it was trying to find out whether
// one already existed. A secretary re-reading this after a failed retry deserves
// the accurate half of that sentence.
const STATUS_CHECK_FAILED =
  'Não foi possível verificar se já existe um comprovante de exclusão para este contato. Nada foi apagado — tente novamente.';
const DELETE_FAILED_AFTER_RECORD =
  'A exclusão foi iniciada mas não terminou. Ela ficou marcada como pendente e será concluída automaticamente; você também pode tentar de novo agora.';
const NOT_FOUND = 'Conversa não encontrada.';
const RENAME_FAILED = 'Não foi possível atualizar o nome. Tente novamente.';

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

  // Guarded together: both are reads that must succeed before anything is
  // written, and the contract says this function never throws. Left unguarded, a
  // database hiccup here would surface a framework error page on the erasure
  // screen instead of a pt-BR message — there is no error.tsx or
  // global-error.tsx anywhere in src/app to catch it. Nothing has been recorded
  // or deleted yet at this point, so this earns the same message as the receipt
  // insert failing below: nothing happened, safe to retry.
  let contact: MemberSubject | null;
  let counts: MemberCounts;
  try {
    contact = await loadMemberSubject(churchId, contactId);
    counts = contact
      ? await countMemberRows(churchId, contactId)
      : { messages: 0, prayers: 0, prayersNovo: 0 };
  } catch {
    return { error: RECORD_FAILED };
  }

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
  // Same reasoning as the guard above: nothing has been deleted on this branch
  // yet, so a failed read here is "nothing happened, try again", not a thrown
  // error reaching the framework's default error page.
  let existing: Awaited<ReturnType<typeof findErasureByContact>>;
  try {
    existing = await findErasureByContact(churchId, contactId);
  } catch {
    return { error: STATUS_CHECK_FAILED };
  }
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

  // Every other failure path in this file returns a pt-BR string; an unguarded
  // throw here would be the odd one out, reaching the framework's default error
  // page instead.
  let updated: number;
  try {
    updated = await renameContact(session.churchId, contactId, name);
  } catch {
    return { error: RENAME_FAILED };
  }
  if (updated === 0) return { error: NOT_FOUND };

  revalidatePath(`/admin/caixa/${contactId}`);
  return { ok: 'Nome atualizado.' };
}
