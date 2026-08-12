'use client';

import { useActionState } from 'react';
import { verifyErasure, type VerifyResult } from './verify-actions';

export function RetentionPanel({ lines }: { lines: string[] }) {
  const [state, action, pending] = useActionState<VerifyResult, FormData>(verifyErasure, { message: '' });

  return (
    <section className="card">
      <h2>Retenção e exclusões</h2>
      {/* C7: this sentence is only true because the nightly purge exists. It ships
          in the same commit as the Privacidade text v2 — see Global Constraint C7. */}
      <p className="hint">
        As conversas e os pedidos de oração são apagados automaticamente após 12 meses.
        A limpeza roda todos os dias de madrugada.
      </p>

      {lines.length === 0 ? (
        <p className="hint">Nenhuma exclusão registrada ainda.</p>
      ) : (
        <ul>
          {/* Index key, not the rendered string: two interrupted retention rows
              (see describeErasureRecord's "all-zero done" case) can render
              byte-identical text on the same date, and there is no other
              unique field in this projection to key on — same reasoning as
              src/app/owner/(protected)/page.tsx's erasure-signal list. */}
          {lines.map((line, i) => (
            <li key={i} className="grow">{line}</li>
          ))}
        </ul>
      )}

      <form action={action}>
        <h3>Verificar uma exclusão</h3>
        <label htmlFor="phone">Número de WhatsApp</label>
        <input id="phone" name="phone" inputMode="tel" />
        <button type="submit" disabled={pending} style={{ marginTop: 12 }}>Verificar</button>
        <p className="hint">
          O número apagado não fica guardado. A verificação usa uma impressão digital (hash) do número.
        </p>
        {state.message && <p>{state.message}</p>}
      </form>
    </section>
  );
}
