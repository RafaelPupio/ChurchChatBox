'use client';

import { useState, useTransition } from 'react';
import { changeStatus } from './actions';
import { GRACE_PERIOD_MS, type ChurchStatus } from '@/lib/church-status';

/** Derived from the one constant that actually drives the deadline, so the copy
 *  can never drift from the behaviour. */
const GRACE_PERIOD_DAYS = Math.round(GRACE_PERIOD_MS / (24 * 60 * 60 * 1000));

export function StatusControls({ churchId, status }: { churchId: string; status: ChurchStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  function set(next: ChurchStatus, confirmText: string) {
    if (!confirm(confirmText)) return;
    setError('');
    start(async () => {
      const r = await changeStatus(churchId, next);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Situação</h2>
      <p className="hint">
        Suspender faz o bot parar de responder e deixa o painel da igreja somente leitura.
        As mensagens continuam sendo registradas — nada é apagado.
      </p>
      <p className="hint">
        Pagamento pendente mantém tudo funcionando por {GRACE_PERIOD_DAYS} dias e avisa a igreja no painel.
        Depois desse prazo o bot é suspenso automaticamente.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button
          disabled={pending || status === 'active'}
          onClick={() => set('active', 'Reativar esta igreja? O bot volta a responder.')}
        >
          Reativar
        </button>
        <button
          disabled={pending || status === 'past_due'}
          onClick={() =>
            set(
              'past_due',
              `Marcar pagamento pendente? A igreja continua funcionando por ${GRACE_PERIOD_DAYS} dias e vê um aviso no painel.`,
            )
          }
        >
          Marcar pagamento pendente
        </button>
        <button
          className="danger"
          disabled={pending || status === 'suspended'}
          onClick={() => set('suspended', 'Suspender esta igreja? O bot vai parar de responder aos membros.')}
        >
          Suspender
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
