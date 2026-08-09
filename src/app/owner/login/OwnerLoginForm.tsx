'use client';

import { useActionState } from 'react';
import { ownerLogin, type OwnerLoginState } from './actions';

const initial: OwnerLoginState = {};

export function OwnerLoginForm() {
  const [state, formAction, pending] = useActionState(ownerLogin, initial);

  return (
    // Same wrapper as the church login. The owner console is a desktop tool and
    // this plan does not restyle it, but its login is reached from a phone often
    // enough — and a horizontal overflow is a bug on any screen.
    <div className="login-wrap">
      <form action={formAction} className="card login-card">
        <h1 style={{ marginTop: 0 }}>Painel do proprietário</h1>
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required />
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {state.error && <p className="error">{state.error}</p>}
        <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12, width: '100%' }}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
