'use client';

import { useState, useTransition } from 'react';
import { endHandoff } from '../actions';

export function EndHandoffButton({ contactId }: { contactId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span className="row" style={{ gap: 8 }}>
      {error && <span className="error">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm('Encerrar o atendimento? O bot volta a responder esta pessoa.')) return;
          setError('');
          // Async transition callback so `pending` tracks the real server round-trip,
          // and the promise is awaited (not fire-and-forget) so failures surface.
          start(async () => {
            try {
              await endHandoff(contactId);
            } catch {
              setError('Não foi possível encerrar. Tente novamente.');
            }
          });
        }}
      >
        {pending ? 'Encerrando…' : '✅ Encerrar atendimento'}
      </button>
    </span>
  );
}
