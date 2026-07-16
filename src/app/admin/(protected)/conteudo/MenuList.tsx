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
      {items.map((item, index) => (
        <div key={item.id} className="card row">
          <div className="row" style={{ flexDirection: 'column', gap: 2 }}>
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
