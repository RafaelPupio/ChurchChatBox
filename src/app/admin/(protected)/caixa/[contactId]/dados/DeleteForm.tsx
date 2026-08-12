'use client';

import { useActionState } from 'react';
import { deleteMemberData, type DeleteResult } from './actions';

const fmt = (d: Date) => new Date(d).toLocaleDateString('pt-BR');

export function DeleteForm({
  contactId, prayersNovo, inFlight,
}: {
  contactId: string;
  prayersNovo: number;
  inFlight: boolean;
}) {
  const [state, action, pending] = useActionState<DeleteResult | Record<string, never>, FormData>(
    deleteMemberData.bind(null, contactId),
    {},
  );

  // `.alarm` is the repo's red box — it already styles its own h2 and p, so the
  // markup carries no per-element classes. This project has NO Tailwind: see the
  // note under Global Constraints on the real class vocabulary.
  return (
    <section className="alarm">
      <h2>Apagar os dados desta pessoa</h2>
      <p>
        Apaga o cadastro, todas as mensagens e todos os pedidos de oração desta pessoa.
        É definitivo e não pode ser desfeito.
      </p>

      {prayersNovo > 0 && (
        <p>
          Atenção: {prayersNovo} pedido(s) de oração ainda marcado(s) como &quot;novo&quot; também será(ão) apagado(s).
        </p>
      )}

      {inFlight && (
        <p>
          Esta conversa está em atendimento e a janela de 24 horas ainda está aberta.
          Depois de apagar não será possível responder por aqui — se precisar avisar a pessoa, faça isso antes.
        </p>
      )}

      <p>Apagar não bloqueia o número. Se a pessoa escrever de novo, uma nova conversa começa do zero.</p>

      <form action={action}>
        {/* The stylesheet styles `label` and `input` globally — full width, 16px
            font (below that iOS Safari zooms on focus and never zooms back), and
            min-height: var(--tap). No utility classes needed or available. */}
        <label htmlFor="confirm">Para confirmar, escreva APAGAR</label>
        <input id="confirm" name="confirm" autoComplete="off" />
        <button type="submit" className="danger" disabled={pending} style={{ marginTop: 12 }}>
          Apagar definitivamente
        </button>
      </form>

      {'ok' in state && state.ok && (
        <p>Dados apagados. Comprovante registrado em {fmt(state.recordedAt)}.</p>
      )}
      {'alreadyDeleted' in state && <p>Estes dados já haviam sido apagados.</p>}
      {'pending' in state && (
        <p>Exclusão pendente desde {fmt(state.since)}. Tente novamente para concluir.</p>
      )}
      {'error' in state && state.error && <p className="error">{state.error}</p>}
    </section>
  );
}
