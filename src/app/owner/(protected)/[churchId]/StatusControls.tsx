'use client';

import { useState, useTransition } from 'react';
import { changeStatus } from './actions';
import type { ChurchStatus } from '@/lib/church-status';

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
      <div className="row" style={{ gap: 8 }}>
        <button
          disabled={pending || status === 'active'}
          onClick={() => set('active', 'Reativar esta igreja? O bot volta a responder.')}
        >
          Reativar
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
