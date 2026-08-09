'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { LIST_ROW_TITLE_MAX, truncateRowTitle } from '@/lib/list-row-title';
import { BEHAVIOUR_ITEM, type BehaviourKind } from '@/lib/behaviour-items';
import type { ItemFormState } from './item-actions';

const initial: ItemFormState = {};

/** The screen that fixes the silent data loss. A prayer or handoff item has ONE
 *  editable property — the name in the menu. Its reply comes from the church's
 *  prayerPromptText / handoffText, so "Texto da resposta" and the image upload
 *  are absent rather than hinted away: both used to render, both accepted her
 *  writing, and menu-router.ts read neither.
 *
 *  In their place: what the item does, the church's own current reply quoted back
 *  so she can see her words did land somewhere, and the way to that field.
 *
 *  And, when this row already carries text or an image from the old form, that
 *  writing handed back to her. Removing the fields stops NEW losses; it does not
 *  by itself address rows that already hold something, which would simply become
 *  unreachable. The row is in hand on the page that renders this, so showing it
 *  costs a prop and a paragraph — and it is the difference between "her words
 *  are safe in a column nobody looks at" and "her words are on her screen". */
export function BehaviourItemForm({
  action,
  kind,
  label: initialLabel,
  currentText,
  orphanBodyText,
  orphanImageUrl,
}: {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  kind: BehaviourKind;
  label: string;
  currentText: string;
  orphanBodyText: string;
  orphanImageUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [label, setLabel] = useState<string>(initialLabel);
  const copy = BEHAVIOUR_ITEM[kind];
  const cut = label.length > LIST_ROW_TITLE_MAX ? truncateRowTitle(label) : '';

  return (
    <form action={formAction} className="card">
      <label htmlFor="label">Nome que aparece no menu</label>
      <input
        id="label"
        name="label"
        type="text"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        required
      />
      {cut ? (
        <p className="warn">
          No WhatsApp esse nome vai aparecer cortado: “{cut}”. Tire alguns caracteres para ele aparecer inteiro.
        </p>
      ) : null}

      <p className="hint" style={{ marginTop: 18, marginBottom: 4 }}>
        O que acontece quando alguém toca nesta opção
      </p>
      <p style={{ margin: '0 0 12px' }}>{copy.explanation}</p>

      <p className="hint" style={{ marginBottom: 4 }}>Hoje a secretária virtual responde assim:</p>
      <p
        style={{
          margin: '0 0 12px',
          padding: 12,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          whiteSpace: 'pre-wrap',
        }}
      >
        {currentText}
      </p>
      <p className="hint">
        Esse texto fica em Configurações, no campo “{copy.settingsField}”.{' '}
        <Link href="/admin/configuracoes">Editar esse texto</Link>
      </p>

      {/* The handback. Renders only for rows that already carry something, so a
          church that never used the old fields never sees it. Read-only on
          purpose: no name="bodyText", no file input, nothing this form submits —
          editItem's behaviour branch writes { label } and nothing else, so these
          columns keep their values whatever she does here. */}
      {(orphanBodyText.trim() || orphanImageUrl) && (
        <div style={{ marginTop: 18 }}>
          <p className="warn" style={{ marginBottom: 4 }}>
            Você escreveu isto aqui antes, quando esta tela ainda tinha um campo de resposta. Este texto nunca
            foi enviado para ninguém, porque esta opção usa o texto de Configurações. Ele está guardado —
            se quiser usá-lo, copie para o campo “{copy.settingsField}” em Configurações.
          </p>
          {orphanBodyText.trim() && (
            <p
              style={{
                margin: '0 0 12px',
                padding: 12,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
              }}
            >
              {orphanBodyText}
            </p>
          )}
          {orphanImageUrl && (
            <p className="hint" style={{ margin: '0 0 12px' }}>
              Também há uma imagem guardada nesta opção, que nunca foi enviada:{' '}
              <a href={orphanImageUrl} target="_blank" rel="noreferrer">ver a imagem</a>
            </p>
          )}
        </div>
      )}

      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}
