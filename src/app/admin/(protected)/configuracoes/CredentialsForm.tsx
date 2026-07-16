'use client';

import { useActionState } from 'react';
import { saveCredentials, type ConfigResult } from './actions';

const initial: ConfigResult = {};

export function CredentialsForm({ values }: { values: { phoneNumberId: string; webhookVerifyToken: string; hasAccessToken: boolean; hasAppSecret: boolean } }) {
  const [state, formAction, pending] = useActionState(saveCredentials, initial);

  return (
    <form action={formAction} className="card">
      <h2 style={{ marginTop: 0 }}>Conexão WhatsApp (Meta)</h2>
      <p className="hint">Credenciais da API Cloud da Meta. Guardadas no banco, nunca no código.</p>

      <label htmlFor="phoneNumberId">Phone Number ID</label>
      <input id="phoneNumberId" name="phoneNumberId" type="text" defaultValue={values.phoneNumberId} />

      <label htmlFor="webhookVerifyToken">Webhook Verify Token</label>
      <input id="webhookVerifyToken" name="webhookVerifyToken" type="text" defaultValue={values.webhookVerifyToken} />

      <label htmlFor="accessToken">Access Token {values.hasAccessToken && <span className="hint">(preenchido — deixe em branco para manter)</span>}</label>
      <input id="accessToken" name="accessToken" type="password" autoComplete="off" placeholder={values.hasAccessToken ? '••••••••' : ''} />

      <label htmlFor="appSecret">App Secret {values.hasAppSecret && <span className="hint">(preenchido — deixe em branco para manter)</span>}</label>
      <input id="appSecret" name="appSecret" type="password" autoComplete="off" placeholder={values.hasAppSecret ? '••••••••' : ''} />

      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p style={{ color: 'var(--ok)' }}>Salvo! ✓</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : 'Salvar credenciais'}
      </button>
    </form>
  );
}
