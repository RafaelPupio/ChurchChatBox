import type { ErasureRecordRow } from '@/lib/repo/erasure';

/** One receipt, as the church reads it. Pure, so the display rule is testable
 *  without a database or a render. */
export function describeErasureRecord(row: ErasureRecordRow): string {
  const date = row.createdAt.toLocaleDateString('pt-BR');
  const suffix = row.status === 'pending' ? ' · pendente' : '';

  if (row.reason === 'retention') {
    // An all-zero DONE row is a real, reachable state: the batch DELETE committed
    // and the +n UPDATE never landed, then the 6-hour sweep froze it. The row is
    // LISTED, never hidden — hiding it is how 500 destroyed message bodies produce
    // no visible line at all. Only `done` earns this wording; a pending row at
    // 0/0/0 may simply still be running.
    const nothingRecorded =
      row.status === 'done' &&
      row.messagesDeleted === 0 && row.prayersDeleted === 0 && row.contactsDeleted === 0;
    if (nothingRecorded) {
      return `${date} · Limpeza automática (12 meses) · a execução foi interrompida antes de registrar a contagem`;
    }
    return `${date} · Limpeza automática (12 meses) · ${row.messagesDeleted} mensagens, ${row.prayersDeleted} pedidos de oração, ${row.contactsDeleted} cadastros apagados${suffix}`;
  }

  const by = row.performedByEmail ? ` · por ${row.performedByEmail}` : '';
  return `${date} · Pedido do titular · ${row.messagesDeleted} mensagens, ${row.prayersDeleted} pedidos de oração${by}${suffix}`;
}
