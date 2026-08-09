'use client';

import { useState, useTransition } from 'react';
import { endHandoff } from '../actions';

export function EndHandoffButton({ contactId }: { contactId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    /* flex: '0 0 auto' so this cannot be stretched or squeezed by the thread
       header it now sits inside — the name beside it is the element that grows. */
    <span className="row" style={{ gap: 8, flex: '0 0 auto' }}>
      {error && <span className="error">{error}</span>}
      <button
        type="button"
        disabled={pending}
        aria-label="Encerrar o atendimento humano desta conversa"
        onClick={() => {
          if (!confirm('Encerrar o atendimento? O bot volta a responder esta pessoa.')) return;
          setError('');
          // Async transition callback so `pending` tracks the real server round-trip,
          // and the promise is awaited (not fire-and-forget) so failures surface.
          start(async () => {
            try {
              // The action reports refusals by RETURNING an error (suspended or
              // revoked); only genuine faults throw. Check both.
              const result = await endHandoff(contactId);
              if (result?.error) setError(result.error);
            } catch {
              setError('Não foi possível encerrar. Tente novamente.');
            }
          });
        }}
      >
        {/* "✅ Encerrar atendimento" wrapped to two lines beside the member's name
            and made the thread header 62px tall on a phone. The full sentence
            lives on the aria-label above, so nothing is lost for a screen reader,
            and the confirm() below still spells out what happens. */}
        {pending ? 'Encerrando…' : 'Encerrar'}
      </button>
    </span>
  );
}
