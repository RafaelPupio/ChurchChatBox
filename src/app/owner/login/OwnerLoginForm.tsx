'use client';

import { useActionState } from 'react';
import { ownerLogin, type OwnerLoginState } from './actions';

const initial: OwnerLoginState = {};

export function OwnerLoginForm() {
  const [state, formAction, pending] = useActionState(ownerLogin, initial);

  return (
    <form action={formAction} className="card" style={{ maxWidth: 360, margin: '80px auto' }}>
      <h1 style={{ marginTop: 0 }}>Painel do proprietário</h1>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Senha</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12, width: '100%' }}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
