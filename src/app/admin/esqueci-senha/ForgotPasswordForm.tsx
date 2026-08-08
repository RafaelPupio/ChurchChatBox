'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { RESET_REQUESTED_MESSAGE } from '@/lib/auth/reset-messages';
import { requestPasswordReset, type ForgotPasswordState } from './actions';

const initial: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initial);

  // The form is replaced rather than kept alongside the confirmation. Leaving a
  // filled-in field under a "we sent it" notice invites a volunteer to press the
  // button again, which does nothing for a minute (the throttle) and reads as the
  // page being broken.
  if (state.sent) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '80px auto' }}>
        <h1 style={{ marginTop: 0 }}>Pronto</h1>
        <p>{RESET_REQUESTED_MESSAGE}</p>
        <Link className="btnlink primary" href="/admin/login" style={{ marginTop: 12, width: '100%' }}>
          Voltar para a entrada
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="card" style={{ maxWidth: 420, margin: '80px auto' }}>
      <h1 style={{ marginTop: 0 }}>Esqueci minha senha</h1>
      <p className="hint">
        Informe o e-mail que você usa para entrar no painel. Vamos enviar uma mensagem com o
        endereço para criar uma nova senha.
      </p>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12, width: '100%' }}>
        {pending ? 'Enviando…' : 'Enviar'}
      </button>
      <p style={{ marginBottom: 0, marginTop: 12, textAlign: 'center' }}>
        <Link href="/admin/login">Voltar para a entrada</Link>
      </p>
    </form>
  );
}
