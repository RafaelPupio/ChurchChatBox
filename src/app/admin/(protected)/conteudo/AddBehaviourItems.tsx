'use client';

import { useState, useTransition } from 'react';
import { BEHAVIOUR_ITEM, type BehaviourKind } from '@/lib/behaviour-items';
import { addBehaviourItem } from './item-actions';

/** Where the "Tipo" dropdown went.
 *
 *  A church needs exactly one prayer item and exactly one handoff item, and their
 *  reply text lives in Configurações — so the answer is known in advance and a
 *  form would only have collected a name the product already has. Written
 *  honestly, each answer names where the church sees the result, and reading
 *  those two sentences makes it obvious a secretary answers this question once in
 *  the church's life. A question answered once is not a form field.
 *
 *  This block renders only while the church lacks a kind, and disappears for good
 *  once it has both.
 *
 *  Which is exactly why it announces NOTHING about a write that worked. Adding the
 *  last missing kind empties `missingBehaviourKinds`, the page stops rendering this
 *  block, and any success message held in this state unmounts before it can be
 *  read. `addBehaviourItem` redirects to ?criado=<id> and the page says it there.
 *  The only thing kept here is the refusal — a blocked session returns instead of
 *  redirecting, the block is still on screen, and nothing was created. */
export function AddBehaviourItems({ kinds }: { kinds: BehaviourKind[] }) {
  const [error, setError] = useState<string>('');
  const [pending, startTransition] = useTransition();

  function add(kind: BehaviourKind) {
    setError('');
    startTransition(async () => {
      const result = await addBehaviourItem(kind);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>Quase toda igreja tem estas opções. Se quiser, adicione com um toque:</p>
      <div className="row wrap">
        {kinds.map((kind) => (
          <button key={kind} disabled={pending} onClick={() => add(kind)}>
            {BEHAVIOUR_ITEM[kind].addButton}
          </button>
        ))}
      </div>
      <p className="hint">A resposta dessas opções você escreve em Configurações, não aqui.</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
