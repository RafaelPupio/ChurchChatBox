'use client';

import { useState, useTransition } from 'react';
import { updatePrivacyText } from './actions';

/** The rollout for the Privacidade text v2. The action itself refuses anything
 *  that is not byte-identical to a body we once seeded, so this button is safe to
 *  offer on every church — a church that already has the current text, or that
 *  edited its own, simply gets that fact back as the message. */
export function UpdatePrivacyText({ churchId }: { churchId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function run() {
    setMessage(null);
    start(async () => {
      const r = await updatePrivacyText(churchId);
      if (r.error) setMessage({ kind: 'error', text: r.error });
      else if (r.ok) setMessage({ kind: 'ok', text: r.ok });
    });
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Texto de Privacidade</h2>
      <p className="hint">
        Atualiza o item 🔒 Privacidade desta igreja para o texto mais recente — apenas se ele ainda
        for exatamente o texto que nós mesmos colocamos lá. Se a igreja já editou o próprio texto,
        nada é sobrescrito.
      </p>
      <button disabled={pending} onClick={run}>
        Atualizar texto de Privacidade
      </button>
      {message && (
        <p className={message.kind === 'error' ? 'error' : 'hint'} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
