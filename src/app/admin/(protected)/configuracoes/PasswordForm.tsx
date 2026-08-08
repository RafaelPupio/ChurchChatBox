'use client';

import { useActionState } from 'react';
import { PASSWORD_MIN } from '@/lib/validation';
import { changePassword, type ConfigResult } from './actions';

const initial: ConfigResult = {};

/** The piece that unblocks people today: every church's first admin is on a
 *  password the vendor generated and typed to them, and until now there was no
 *  way to replace it. */
export function PasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(changePassword, initial);

  return (
    <form action={formAction} className="card">
      <h2 style={{ marginTop: 0 }}>Sua senha</h2>
      <p className="hint">
        Você entra no painel com <strong>{email}</strong>. Aqui você troca a senha dessa conta.
      </p>

      {/* Hidden, and there for password managers: without a username field on the
          page they offer to save the new password under no account, or refuse to
          fill the current one. */}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />

      <label htmlFor="current-password">Senha atual</label>
      <input
        id="current-password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
      />

      <label htmlFor="new-password">Nova senha</label>
      <input
        id="new-password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
      />
      <p className="hint">Use pelo menos {PASSWORD_MIN} caracteres.</p>

      <label htmlFor="confirm-password">Repita a nova senha</label>
      <input
        id="confirm-password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
      />

      {state.error && <p className="error">{state.error}</p>}
      {state.ok && (
        <p style={{ color: 'var(--ok)' }}>
          Senha alterada! ✓ Se você usa o painel em outro celular ou computador, será preciso
          entrar de novo lá com a nova senha.
        </p>
      )}

      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  );
}
