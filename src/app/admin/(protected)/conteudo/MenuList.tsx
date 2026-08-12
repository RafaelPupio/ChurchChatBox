'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { BEHAVIOUR_ITEM, isBehaviourKind } from '@/lib/behaviour-items';
import { PRIVACY_ITEM } from '@/lib/church-defaults';
import { moveItem, setItemActive } from './actions';

export interface MenuListItem {
  id: string;
  label: string;
  kind: 'content' | 'prayer' | 'human';
  isActive: boolean;
  hasImage: boolean;
}

export function MenuList({ items }: { items: MenuListItem[] }) {
  // Keyed by the row that produced it, not one message for the whole list. A
  // single error above row 1 was survivable while the only refusal was the
  // 10-item cap, which almost nobody reached. Task 4's hide-floor is reachable:
  // a church with one active item at row 7 taps "Tirar do menu", the explanation
  // paints above the fold, and on a phone nothing visibly happens at all. The
  // plan's own rule is that a message appears where the rule bites.
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(itemId: string, fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError({ id: itemId, message: result.error });
    });
  }

  return (
    <div>
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
                onClick={() => run(item.id, () => moveItem(item.id, 'up'))}
                aria-label={`Subir “${item.label}” no menu`}
              >
                ▲
              </button>
              <button
                className="iconbtn"
                disabled={pending || index === items.length - 1}
                onClick={() => run(item.id, () => moveItem(item.id, 'down'))}
                aria-label={`Descer “${item.label}” no menu`}
              >
                ▼
              </button>
              <span className="grow" />
              <button
                disabled={pending}
                onClick={() => run(item.id, () => setItemActive(item.id, !item.isActive))}
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
            {item.label === PRIVACY_ITEM.label && (
              <p className="hint">
                O item 🔒 Privacidade é o aviso que os membros leem no WhatsApp. Você pode editá-lo, mas
                mantenha o que é guardado, por quê, por quanto tempo, com quem é compartilhado e como
                pedir cópia ou exclusão.
              </p>
            )}
            {error?.id === item.id && <p className="error" style={{ marginBottom: 0 }}>{error.message}</p>}
          </div>
        );
      })}
    </div>
  );
}
