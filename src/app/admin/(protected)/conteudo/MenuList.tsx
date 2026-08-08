'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { moveItem, setItemActive } from './actions';

export interface MenuListItem {
  id: string;
  label: string;
  kind: 'content' | 'prayer' | 'human';
  isActive: boolean;
  hasImage: boolean;
}

export function MenuList({ items }: { items: MenuListItem[] }) {
  const [error, setError] = useState<string>('');
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    setError('');
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {/* `wrap`: five controls plus a label do not fit one 375px line. Without it
          the label is squeezed to min-content and, once .grow stopped refusing to
          shrink, down to a 33.6px column of single letters — measured. See the
          .row.wrap rule in globals.css. */}
      {items.map((item, index) => (
        <div key={item.id} className="card row wrap">
          {/* 10px apart, not 2px. Each arrow is an immediate server write that
              reorders the live WhatsApp menu, and 44px targets 2px apart on a
              phone means the mis-tap moves the item the wrong way — with no undo
              beyond noticing and pressing the other arrow. */}
          <div className="row" style={{ flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            <button disabled={pending || index === 0} onClick={() => run(() => moveItem(item.id, 'up'))} aria-label="Mover para cima">▲</button>
            <button disabled={pending || index === items.length - 1} onClick={() => run(() => moveItem(item.id, 'down'))} aria-label="Mover para baixo">▼</button>
          </div>
          <span className="grow">
            {item.label}
            {item.hasImage && <span className="hint"> 📎 imagem</span>}
            {item.kind !== 'content' && <span className="hint"> · {item.kind === 'prayer' ? 'oração' : 'atendente'}</span>}
          </span>
          <span className={`chip ${item.isActive ? 'on' : 'off'}`}>{item.isActive ? 'Ativo' : 'Oculto'}</span>
          <button disabled={pending} onClick={() => run(() => setItemActive(item.id, !item.isActive))}>
            {item.isActive ? 'Ocultar' : 'Ativar'}
          </button>
          <Link className="btnlink" href={`/admin/conteudo/${item.id}`}>Editar</Link>
        </div>
      ))}
    </div>
  );
}
