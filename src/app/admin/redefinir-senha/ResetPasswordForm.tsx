'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { PASSWORD_MIN } from '@/lib/validation';
import { resetPassword, type ResetPasswordState } from './actions';

const initial: ResetPasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initial);

  if (state.ok) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '80px auto' }}>
        <h1 style={{ marginTop: 0 }}>Senha criada</h1>
        <p>Sua nova senha já está valendo. Use ela para entrar no painel.</p>
        <p className="hint">
          Por segurança, quem estava usando o painel com a senha antiga foi desconectado.
        </p>
        <Link className="btnlink primary" href="/admin/login" style={{ marginTop: 12, width: '100%' }}>
          Entrar no painel
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="card" style={{ maxWidth: 420, margin: '80px auto' }}>
      <h1 style={{ marginTop: 0 }}>Criar uma nova senha</h1>
      {/* The token travels in the form body, not re-read from the URL by the
          action. The URL is the only place it can be seen — browser history,
          a Referer header, a screenshot of the address bar — so nothing after
          this page should depend on it still being there. */}
      <input type="hidden" name="token" value={token} />
      <label htmlFor="password">Nova senha</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
        autoFocus
      />
      <p className="hint">Use pelo menos {PASSWORD_MIN} caracteres.</p>
      <label htmlFor="confirmation">Repita a nova senha</label>
      <input
        id="confirmation"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
      />
      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12, width: '100%' }}>
        {pending ? 'Salvando…' : 'Salvar nova senha'}
      </button>
      <p style={{ marginBottom: 0, marginTop: 12, textAlign: 'center' }}>
        <Link href="/admin/esqueci-senha">Pedir um novo endereço</Link>
      </p>
    </form>
  );
}
