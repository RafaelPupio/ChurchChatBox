'use client';

import { useState, useTransition } from 'react';
import { seedPrivacyItem } from './actions';

/** Shown only when a church has zero menu items — the state provisionChurch now
 *  deliberately leaves behind rather than rolling the whole church back over a
 *  failed menu insert. A church with no Privacidade item gives its members no way
 *  to read what is stored about them, which is an LGPD transparency gap, so the
 *  repair belongs where the owner will see it. */
export function PrivacyItemWarning({ churchId }: { churchId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  function create() {
    if (!confirm('Criar o item “🔒 Privacidade” no menu desta igreja?')) return;
    setError('');
    start(async () => {
      const r = await seedPrivacyItem(churchId);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Menu vazio</h2>
      <p className="warn">
        ⚠️ Esta igreja está sem nenhum item no menu, incluindo o item de Privacidade que toda igreja
        recebe ao ser criada. Sem ele, os membros não têm como consultar o que é feito com os dados
        deles.
      </p>
      <button disabled={pending} onClick={create}>
        Criar item de Privacidade
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
