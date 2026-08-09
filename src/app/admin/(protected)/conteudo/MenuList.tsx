'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { BEHAVIOUR_ITEM, isBehaviourKind } from '@/lib/behaviour-items';
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
      {items.map((item, index) => {
        /* A behaviour item's line says what a tap DOES. It replaces "· oração" /
           "· atendente", which named an internal category and told her nothing
           about where the church sees the result. */
        const meta = isBehaviourKind(item.kind)
          ? BEHAVIOUR_ITEM[item.kind].listNote
          : item.hasImage
            ? '📎 com imagem'
            : '';

        return (
          <div key={item.id} className="card item-card">
            {/* Name first and full-width: it is the only way to know which row you
                are about to take out of the menu, reorder or edit. */}
            <div className="item-head">
              <span className="item-label">
                {item.label}
                {meta && <span className="hint item-meta">{meta}</span>}
              </span>
              {/* The chip states WHERE the option is; the button below states what
                  pressing it does. "Oculto" next to "Ativar" was a state and a
                  verb from the same vocabulary sitting adjacent. */}
              <span className={`chip ${item.isActive ? 'on' : 'off'}`}>
                {item.isActive ? 'No menu' : 'Fora do menu'}
              </span>
            </div>
            {/* Every aria-label names the item: these controls sit on their own
                line, away from the label a screen reader would otherwise
                associate with them. */}
            <div className="item-actions">
              <button
                className="iconbtn"
                disabled={pending || index === 0}
                onClick={() => run(() => moveItem(item.id, 'up'))}
                aria-label={`Subir “${item.label}” no menu`}
              >
                ▲
              </button>
              <button
                className="iconbtn"
                disabled={pending || index === items.length - 1}
                onClick={() => run(() => moveItem(item.id, 'down'))}
                aria-label={`Descer “${item.label}” no menu`}
              >
                ▼
              </button>
              <span className="grow" />
              <button
                disabled={pending}
                onClick={() => run(() => setItemActive(item.id, !item.isActive))}
                aria-label={
                  item.isActive ? `Tirar “${item.label}” do menu` : `Colocar “${item.label}” no menu`
                }
              >
                {item.isActive ? 'Tirar do menu' : 'Colocar no menu'}
              </button>
              <Link
                className="btnlink"
                href={`/admin/conteudo/${item.id}`}
                aria-label={`Editar “${item.label}”`}
              >
                Editar
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
