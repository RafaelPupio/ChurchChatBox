'use client';

import { useActionState } from 'react';
import { createChurch, type NewChurchState } from './actions';

const initial: NewChurchState = {};

export function NewChurchForm() {
  const [state, formAction, pending] = useActionState(createChurch, initial);

  return (
    <details className="card">
      <summary><strong>+ Nova igreja</strong></summary>
      <form action={formAction} style={{ marginTop: 12 }}>
        <label htmlFor="nc-name">Nome da igreja</label>
        <input id="nc-name" name="name" type="text" required />

        <label htmlFor="nc-email">E-mail do administrador</label>
        <input id="nc-email" name="email" type="email" required />

        <label htmlFor="nc-password">Senha inicial (mín. 8 caracteres)</label>
        <input id="nc-password" name="password" type="password" autoComplete="new-password" required />

        <p className="hint">
          A igreja começa com o menu vazio, apenas com o item de Privacidade. Conecte o WhatsApp
          dela depois, na página da igreja.
        </p>

        {state.error && <p className="error">{state.error}</p>}
        {state.created && <p style={{ color: 'var(--ok)' }}>Igreja “{state.created}” criada! ✓</p>}

        <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
          {pending ? 'Criando…' : 'Criar igreja'}
        </button>
      </form>
    </details>
  );
}
