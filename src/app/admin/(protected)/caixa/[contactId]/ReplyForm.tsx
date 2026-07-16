'use client';

import { useActionState } from 'react';
import { sendReplyToContact, type ReplyState } from '../actions';

const initial: ReplyState = {};

export function ReplyForm({ contactId, hoursRemaining }: { contactId: string; hoursRemaining: number }) {
  const action = sendReplyToContact.bind(null, contactId);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="card">
      <label htmlFor="body">Responder</label>
      <textarea id="body" name="body" required />
      <div className="row" style={{ marginTop: 10 }}>
        <span className="hint grow">⏱️ Janela de resposta: ~{hoursRemaining}h restantes</span>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
