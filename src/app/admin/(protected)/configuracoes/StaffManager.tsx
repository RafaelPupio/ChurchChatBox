'use client';

import { useState, useTransition } from 'react';
import { useActionState } from 'react';
import { addStaff, removeStaff, type ConfigResult } from './actions';

const initial: ConfigResult = {};

export interface StaffRow { id: string; email: string; name: string | null; isSelf: boolean; }

export function StaffManager({ staff }: { staff: StaffRow[] }) {
  const [state, formAction, pending] = useActionState(addStaff, initial);
  const [rowError, setRowError] = useState('');
  const [removing, startRemove] = useTransition();

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Equipe</h2>
      {staff.map((s) => (
        <div key={s.id} className="row" style={{ padding: '6px 0' }}>
          <span className="grow">{s.name || s.email} <span className="hint">{s.email}</span></span>
          {s.isSelf ? (
            <span className="hint">você</span>
          ) : (
            <button className="danger" disabled={removing} onClick={() => {
              if (!confirm(`Remover ${s.email}?`)) return;
              setRowError('');
              startRemove(async () => { const r = await removeStaff(s.id); if (r?.error) setRowError(r.error); });
            }}>Remover</button>
          )}
        </div>
      ))}
      {rowError && <p className="error">{rowError}</p>}

      <form action={formAction} style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <h3 style={{ margin: '0 0 8px' }}>Adicionar conta</h3>
        <label htmlFor="staff-name">Nome</label>
        <input id="staff-name" name="name" type="text" />
        <label htmlFor="staff-email">E-mail</label>
        <input id="staff-email" name="email" type="email" required />
        <label htmlFor="staff-password">Senha (mín. 8 caracteres)</label>
        <input id="staff-password" name="password" type="password" autoComplete="new-password" required />
        {state.error && <p className="error">{state.error}</p>}
        {state.ok && <p style={{ color: 'var(--ok)' }}>Conta adicionada! ✓</p>}
        <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
          {pending ? 'Adicionando…' : 'Adicionar'}
        </button>
      </form>
    </div>
  );
}
