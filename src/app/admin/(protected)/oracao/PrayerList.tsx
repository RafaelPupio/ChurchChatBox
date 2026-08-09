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
        <div key={p.id} className="card prayer-card">
          {/* The request is what this screen is for — it gets the full width, and
              the button that used to take half the row goes underneath it. On a
              375px phone the old `row wrap` layout left the text a ~70px ribbon
              beside a 172px button: ten lines of one or two words each, for
              something that exists to be read aloud. */}
          <p className="prayer-text">“{p.text}”</p>
          <p className="hint prayer-meta">{p.who} · {p.when}</p>
          <div className="item-actions">
            <span className={`chip ${p.status === 'orado' ? 'on' : 'off'}`}>
              {p.status === 'orado' ? 'Orado ✓' : 'Novo'}
            </span>
            <span className="grow" />
            <button
              disabled={pending}
              onClick={() => toggle(p.id, p.status)}
              /* Names WHOSE request this button acts on: with the control now on
                 its own line, "Marcar como orado" repeated down the screen is the
                 only thing a screen reader announces otherwise. */
              aria-label={
                p.status === 'orado'
                  ? `Marcar o pedido de ${p.who} como novo`
                  : `Marcar o pedido de ${p.who} como orado`
              }
            >
              {p.status === 'orado' ? 'Marcar como novo' : 'Marcar como orado'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
