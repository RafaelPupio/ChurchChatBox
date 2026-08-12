import { describe, expect, it } from 'vitest';
import { describeErasureRecord } from '@/lib/erasure-copy';

const base = {
  id: 'r1', subjectContactId: null, subjectPhoneHash: null, performedByEmail: null,
  completedAt: new Date('2026-08-07T07:00:00Z'), createdAt: new Date('2026-08-07T06:00:00Z'),
};

describe('describeErasureRecord', () => {
  it('renders a completed retention run with its three counts', () => {
    expect(describeErasureRecord({
      ...base, reason: 'retention', status: 'done',
      messagesDeleted: 1240, prayersDeleted: 12, contactsDeleted: 3,
    })).toBe('07/08/2026 · Limpeza automática (12 meses) · 1240 mensagens, 12 pedidos de oração, 3 cadastros apagados');
  });

  it('renders an ALL-ZERO done retention row as interrupted, and never hides it', () => {
    // The row that exists because 500 message bodies can be destroyed while the
    // counter update never lands. Hiding it is how that becomes invisible.
    expect(describeErasureRecord({
      ...base, reason: 'retention', status: 'done',
      messagesDeleted: 0, prayersDeleted: 0, contactsDeleted: 0,
    })).toBe('07/08/2026 · Limpeza automática (12 meses) · a execução foi interrompida antes de registrar a contagem');
  });

  it('renders a subject request with the acting staff email', () => {
    expect(describeErasureRecord({
      ...base, reason: 'subject_request', status: 'done', performedByEmail: 'secretaria@igreja.org',
      messagesDeleted: 412, prayersDeleted: 3, contactsDeleted: 1,
    })).toBe('07/08/2026 · Pedido do titular · 412 mensagens, 3 pedidos de oração · por secretaria@igreja.org');
  });

  it('appends the pending suffix', () => {
    expect(describeErasureRecord({
      ...base, reason: 'retention', status: 'pending',
      messagesDeleted: 500, prayersDeleted: 0, contactsDeleted: 0,
    })).toContain(' · pendente');
  });

  it('does NOT call a pending all-zero row interrupted — it may still be running', () => {
    const line = describeErasureRecord({
      ...base, reason: 'retention', status: 'pending',
      messagesDeleted: 0, prayersDeleted: 0, contactsDeleted: 0,
    });
    expect(line).not.toContain('interrompida');
    expect(line).toContain(' · pendente');
  });
});

describe('the display rule: no filter', () => {
  it('an all-zero done row survives into the rendered lines', () => {
    // Revision 2 of the spec hid exactly this row. Trace what that costs: 500
    // message bodies committed, the +500 update lost, the sweep freezes it at
    // 0/0/0 — and the church is shown NO LINE AT ALL. The filter is the defect.
    const rows = [
      { ...base, reason: 'retention' as const, status: 'done' as const,
        messagesDeleted: 0, prayersDeleted: 0, contactsDeleted: 0 },
      { ...base, reason: 'retention' as const, status: 'done' as const,
        messagesDeleted: 1240, prayersDeleted: 12, contactsDeleted: 3 },
    ];
    const lines = rows.map(describeErasureRecord);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('interrompida');
  });
});
