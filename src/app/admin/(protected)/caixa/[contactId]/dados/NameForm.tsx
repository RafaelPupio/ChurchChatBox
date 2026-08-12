'use client';

import { useActionState } from 'react';
import { renameMember, type RenameResult } from './actions';

export function NameForm({ contactId, currentName }: { contactId: string; currentName: string | null }) {
  const [state, action, pending] = useActionState<RenameResult, FormData>(
    renameMember.bind(null, contactId),
    {},
  );

  return (
    <form action={action} className="card">
      <label htmlFor="name">Nome</label>
      <input id="name" name="name" defaultValue={currentName ?? ''} />
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        Salvar nome
      </button>
      {state.ok && <p className="hint">{state.ok}</p>}
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
