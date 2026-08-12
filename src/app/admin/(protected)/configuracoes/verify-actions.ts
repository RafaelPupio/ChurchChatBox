'use server';

import { requireReadableSession } from '@/lib/auth/writable';
import { phoneHashCandidates } from '@/lib/erasure-hash';
import { findErasureByPhoneHash } from '@/lib/repo/erasure';

export type VerifyResult = { message: string };

/** "Sim, o número X foi apagado em 12/03" — the proof that works for the returning
 *  member, not just for the regulator.
 *
 *  Uses requireReadableSession, not a data-rights guard: this is a READ of the
 *  church's own audit log and grants no new power. It is not one of the three
 *  suspension-exempt entry points. */
export async function verifyErasure(_prev: VerifyResult, formData: FormData): Promise<VerifyResult> {
  const { churchId } = await requireReadableSession();

  // NOT a single hash. The stored number came from Meta's `from` field, which is
  // always E.164 without the plus — 5511999998888, country code included. The
  // number in this box was TYPED by a secretary, who will very reasonably write
  // (11) 99999-8888. Digit-stripping alone makes those two different strings, so a
  // single hash would answer "nenhuma exclusão registrada" for a member whose data
  // WAS erased — the one question this box exists to answer correctly, wrong, in
  // the direction that looks like a clean bill of health.
  const candidates = phoneHashCandidates(String(formData.get('phone') ?? ''));
  if (candidates.length === 0) {
    return { message: 'A verificação não está disponível nesta instalação.' };
  }

  let found = null;
  for (const hash of candidates) {
    found = await findErasureByPhoneHash(churchId, hash);
    if (found) break;
  }
  if (!found) return { message: 'Nenhuma exclusão registrada para este número.' };

  return {
    message: `Sim. Os dados deste número foram apagados em ${found.createdAt.toLocaleDateString('pt-BR')}.`,
  };
}
