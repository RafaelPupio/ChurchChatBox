'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { login, type LoginState } from './actions';

const initial: LoginState = {};

export function LoginForm({ canResetByEmail }: { canResetByEmail: boolean }) {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <form action={formAction} className="card" style={{ maxWidth: 360, margin: '80px auto' }}>
      <h1 style={{ marginTop: 0 }}>Entrar</h1>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Senha</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12, width: '100%' }}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
      {/* Offered only when a message would actually arrive. Advertising it with no
          transport tells a locked-out secretary a link is on its way and leaves her
          waiting for one that will never come — worse than no link at all, because
          she stops looking for help. */}
      <p style={{ marginBottom: 0, marginTop: 12, textAlign: 'center' }}>
        {canResetByEmail ? (
          <Link href="/admin/esqueci-senha">Esqueci minha senha</Link>
        ) : (
          <span className="hint">
            Esqueceu a senha? Fale com quem cuida do sistema da sua igreja.
          </span>
        )}
      </p>
    </form>
  );
}
