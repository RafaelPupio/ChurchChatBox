import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above every import AND above any top-level
// `const`, so a factory that closes over a plain `const x = vi.fn()` throws
// "Cannot access 'x' before initialization" — the mock runs before the const
// is ever assigned. vi.hoisted() is itself hoisted alongside the mocks, so its
// return value exists by the time the factories below execute. Same pattern as
// tests/session-guards.test.ts and tests/webhook-alarm.test.ts.
const h = vi.hoisted(() => ({
  requireDataRightsSession: vi.fn(),
  loadMemberSubject: vi.fn(),
  countMemberRows: vi.fn(),
  deleteMember: vi.fn(),
  renameContact: vi.fn(),
  openSubjectErasure: vi.fn(),
  completeErasureRecord: vi.fn(),
  findErasureByContact: vi.fn(),
  hashPhone: vi.fn(),
}));

vi.mock('@/lib/auth/writable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/writable')>('@/lib/auth/writable');
  return { ...actual, requireDataRightsSession: h.requireDataRightsSession };
});
vi.mock('@/lib/repo/member-data', () => ({
  loadMemberSubject: h.loadMemberSubject,
  countMemberRows: h.countMemberRows,
  deleteMember: h.deleteMember,
  renameContact: h.renameContact,
}));
vi.mock('@/lib/repo/erasure', () => ({
  openSubjectErasure: h.openSubjectErasure,
  completeErasureRecord: h.completeErasureRecord,
  findErasureByContact: h.findErasureByContact,
}));
vi.mock('@/lib/erasure-hash', () => ({ hashPhone: h.hashPhone }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { deleteMemberData, renameMember } from '@/app/admin/(protected)/caixa/[contactId]/dados/actions';

const {
  requireDataRightsSession, loadMemberSubject, countMemberRows, deleteMember,
  renameContact, openSubjectErasure, completeErasureRecord, findErasureByContact, hashPhone,
} = h;

const SESSION = { adminUserId: 'a1', churchId: 'c1', name: 'Secretária', email: 'secretaria@igreja.org' };
const CONTACT = { id: 'ct1', name: 'Maria', phone: '5511999998888', mode: 'bot', lastInboundAt: null, createdAt: new Date() };
const OPENED_AT = new Date('2026-08-11T10:00:00.000Z');

function confirmed(word = 'APAGAR'): FormData {
  const fd = new FormData();
  fd.set('confirm', word);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireDataRightsSession.mockResolvedValue(SESSION);
  loadMemberSubject.mockResolvedValue(CONTACT);
  countMemberRows.mockResolvedValue({ messages: 412, prayers: 3, prayersNovo: 1 });
  hashPhone.mockReturnValue('hash-abc');
  openSubjectErasure.mockResolvedValue({ id: 'rec1', createdAt: OPENED_AT });
  deleteMember.mockResolvedValue(1);
  completeErasureRecord.mockResolvedValue(undefined);
});

describe('deleteMemberData — the confirmation gate', () => {
  it('refuses without the typed word, reading and writing NOTHING first', async () => {
    const result = await deleteMemberData('ct1', {}, confirmed('apagar tudo'));
    expect(result).toEqual({ error: 'Escreva APAGAR para confirmar.' });
    expect(loadMemberSubject).not.toHaveBeenCalled();
    expect(openSubjectErasure).not.toHaveBeenCalled();
  });

  it('is case-sensitive — "apagar" is not the confirmation', async () => {
    expect(await deleteMemberData('ct1', {}, confirmed('apagar')))
      .toEqual({ error: 'Escreva APAGAR para confirmar.' });
  });
});

describe('deleteMemberData — the happy path', () => {
  it('opens the receipt BEFORE deleting, then completes it', async () => {
    const order: string[] = [];
    openSubjectErasure.mockImplementation(async () => { order.push('open'); return { id: 'rec1', createdAt: OPENED_AT }; });
    deleteMember.mockImplementation(async () => { order.push('delete'); return 1; });
    completeErasureRecord.mockImplementation(async () => { order.push('complete'); });

    const result = await deleteMemberData('ct1', {}, confirmed());
    expect(result).toEqual({ ok: true, recordedAt: OPENED_AT });
    // Evidence before destruction. The reverse ordering would destroy a year of
    // message bodies with zero Art. 6 X evidence if the insert failed.
    expect(order).toEqual(['open', 'delete', 'complete']);
  });

  it('carries the PRE-DELETE counts and the phone hash onto the receipt', async () => {
    await deleteMemberData('ct1', {}, confirmed());
    expect(openSubjectErasure).toHaveBeenCalledWith({
      churchId: 'c1', contactId: 'ct1', phoneHash: 'hash-abc',
      performedByEmail: 'secretaria@igreja.org', messages: 412, prayers: 3,
    });
  });

  it('proceeds when the hash secret is missing, storing null', async () => {
    // Fails TOWARD the member's right: a missing operator env var must never be
    // the reason a statutory erasure does not happen.
    hashPhone.mockReturnValue(null);
    const result = await deleteMemberData('ct1', {}, confirmed());
    expect(result).toEqual({ ok: true, recordedAt: OPENED_AT });
    expect(openSubjectErasure).toHaveBeenCalledWith(expect.objectContaining({ phoneHash: null }));
  });

  it('completes the record even when deleteMember reports 0 rows', async () => {
    // The contact vanished between the insert and the delete. The record's
    // assertion — this contact's data is not in the database — is true, so a
    // pending alarm about an already-correct state would be noise.
    deleteMember.mockResolvedValue(0);
    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ ok: true, recordedAt: OPENED_AT });
    expect(completeErasureRecord).toHaveBeenCalledWith('rec1', 'c1');
  });
});

describe('deleteMemberData — zero rows inserted', () => {
  it('reports alreadyDeleted on the double-click, writing no second record', async () => {
    openSubjectErasure.mockResolvedValue(null);
    findErasureByContact.mockResolvedValue({ id: 'rec1', status: 'done', createdAt: OPENED_AT });

    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ alreadyDeleted: true });
    expect(deleteMember).not.toHaveBeenCalled();
  });

  it('retries a pending record and completes it', async () => {
    openSubjectErasure.mockResolvedValue(null);
    findErasureByContact.mockResolvedValue({ id: 'rec1', status: 'pending', createdAt: OPENED_AT });
    deleteMember.mockResolvedValue(1);

    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ ok: true, recordedAt: OPENED_AT });
    expect(completeErasureRecord).toHaveBeenCalledWith('rec1', 'c1');
  });

  it('reports pending when the retry also fails', async () => {
    openSubjectErasure.mockResolvedValue(null);
    findErasureByContact.mockResolvedValue({ id: 'rec1', status: 'pending', createdAt: OPENED_AT });
    deleteMember.mockRejectedValue(new Error('neon down'));

    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ pending: true, since: OPENED_AT });
  });

  it('reports not-found when there is no record and no contact', async () => {
    loadMemberSubject.mockResolvedValue(null);
    openSubjectErasure.mockResolvedValue(null);
    findErasureByContact.mockResolvedValue(null);

    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({ error: 'Conversa não encontrada.' });
  });
});

describe('deleteMemberData — failures', () => {
  it('deletes NOTHING when the receipt cannot be written', async () => {
    openSubjectErasure.mockRejectedValue(new Error('insert failed'));
    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({
      error: 'Não foi possível registrar o comprovante de exclusão. Nada foi apagado — tente novamente.',
    });
    expect(deleteMember).not.toHaveBeenCalled();
  });

  it('reports the "started but did not finish" error when the delete throws after the receipt opened', async () => {
    deleteMember.mockRejectedValue(new Error('neon down'));
    expect(await deleteMemberData('ct1', {}, confirmed())).toEqual({
      error: 'A exclusão foi iniciada mas não terminou. Ela ficou marcada como pendente e será concluída automaticamente; você também pode tentar de novo agora.',
    });
  });

  it('surfaces a revoked session as its pt-BR message', async () => {
    requireDataRightsSession.mockResolvedValue({ blocked: 'revoked' });
    const result = await deleteMemberData('ct1', {}, confirmed()) as { error: string };
    expect(result.error).toContain('não tem mais acesso');
  });
});

describe('renameMember', () => {
  it('renames and reports success', async () => {
    renameContact.mockResolvedValue(1);
    const fd = new FormData();
    fd.set('name', 'Maria de Souza');
    expect(await renameMember('ct1', {}, fd)).toEqual({ ok: 'Nome atualizado.' });
  });

  it('refuses a blank name', async () => {
    const fd = new FormData();
    fd.set('name', '   ');
    expect(await renameMember('ct1', {}, fd)).toEqual({ error: 'O nome não pode ficar em branco.' });
    expect(renameContact).not.toHaveBeenCalled();
  });

  it('reports not-found when the contact is another church\'s', async () => {
    renameContact.mockResolvedValue(0);
    const fd = new FormData();
    fd.set('name', 'Invadido');
    expect(await renameMember('ct1', {}, fd)).toEqual({ error: 'Conversa não encontrada.' });
  });
});
