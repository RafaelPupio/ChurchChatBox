'use client';

import { useState, useTransition } from 'react';
import { setPrayerStatus } from './actions';

export interface PrayerRow {
  id: string;
  text: string;
  status: 'novo' | 'orado';
  who: string;
  when: string;
}

export function PrayerList({ prayers }: { prayers: PrayerRow[] }) {
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  function toggle(id: string, status: 'novo' | 'orado') {
    setError('');
    start(async () => {
      const r = await setPrayerStatus(id, status === 'novo' ? 'orado' : 'novo');
      if (r?.error) setError(r.error);
    });
  }

  if (prayers.length === 0) return <p className="hint">Nenhum pedido ainda.</p>;

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {prayers.map((p) => (
        <div key={p.id} className="card row">
          <span className="grow">
            "{p.text}"<span className="hint"> — {p.who} · {p.when}</span>
          </span>
          <span className={`chip ${p.status === 'orado' ? 'on' : 'off'}`}>{p.status === 'orado' ? 'Orado ✓' : 'Novo'}</span>
          <button disabled={pending} onClick={() => toggle(p.id, p.status)}>
            {p.status === 'orado' ? 'Marcar como novo' : 'Marcar como orado'}
          </button>
        </div>
      ))}
    </div>
  );
}
