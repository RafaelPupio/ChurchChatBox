'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveTexts, type ConfigResult } from './actions';

const initial: ConfigResult = {};

interface Field { name: string; label: string; }
interface Group { id: string; title: string; fields: Field[]; }

/** Same ten fields, same names, same action — grouped by when the member sees
 *  them, so a correction to the saudação does not mean scrolling past seven
 *  unrelated boxes. The flat list rendered 1458px tall, about 1.8 phone screens
 *  of visually identical boxes, with the save button 1405px in. */
const GROUPS: Group[] = [
  {
    id: 'boas-vindas',
    title: 'Boas-vindas e menu',
    fields: [
      { name: 'greetingText', label: 'Saudação (primeiro contato)' },
      { name: 'menuHeaderText', label: 'Cabeçalho do menu' },
      { name: 'menuButtonLabel', label: 'Rótulo do botão do menu (ex.: Ver opções)' },
    ],
  },
  {
    id: 'nao-entendeu',
    title: 'Quando o bot não entende',
    fields: [
      { name: 'fallbackText', label: 'Mensagem quando não entende' },
      { name: 'unsupportedMediaText', label: 'Mensagem para áudio/figurinha/foto' },
      { name: 'errorText', label: 'Mensagem de instabilidade' },
    ],
  },
  {
    id: 'oracao',
    title: 'Pedidos de oração',
    fields: [
      { name: 'prayerPromptText', label: 'Pedir o texto da oração' },
      { name: 'prayerThanksText', label: 'Agradecimento do pedido de oração' },
    ],
  },
  {
    id: 'atendimento',
    title: 'Atendimento humano',
    fields: [
      { name: 'handoffText', label: 'Ao encaminhar para um atendente' },
      { name: 'handoffClosedText', label: 'Ao encerrar o atendimento' },
    ],
  },
];

export function TextsForm({ values }: { values: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(saveTexts, initial);
  const [dirty, setDirty] = useState<string[]>([]);

  /** A successful save clears the unsaved-changes state, and the browser warning
   *  goes with it.
   *
   *  Keyed on `state`, not on `state.ok`. useActionState hands back a fresh object
   *  on every settled dispatch, but `ok` is a boolean that stays `true` — so a
   *  SECOND successful save would not re-run this, and the save bar would go on
   *  claiming "● Alterações não salvas" over text that is already in the database.
   *  Same reasoning, same fix as the reply composer's draft effect. */
  useEffect(() => { if (state.ok) setDirty([]); }, [state]);

  /** The browser's own "leave site?" prompt. It is the only thing that survives an
   *  accidental iOS back-swipe — which on this screen used to discard ten edited
   *  boxes silently — and it must NOT be armed when nothing is dirty. */
  useEffect(() => {
    if (dirty.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty.length]);

  function markDirty(groupId: string) {
    setDirty((current) => (current.includes(groupId) ? current : [...current, groupId]));
  }

  return (
    <form action={formAction} className="card">
      <h2 style={{ marginTop: 0 }}>Textos do bot</h2>
      <p className="hint">Tudo o que a secretária virtual diz. Abra uma seção, edite e salve — muda na hora.</p>

      <div onInput={() => markDirty('igreja')}>
        <label htmlFor="name">Nome da igreja</label>
        <input id="name" name="name" type="text" defaultValue={values.name ?? ''} />
      </div>

      {/* A collapsed <details> keeps its inputs in the DOM, so every field is
          submitted whether or not its section is open. Conditional rendering here
          would silently blank the closed sections on the first save — the exact
          failure this screen cannot afford, because the blanked text is what the
          bot says to members.

          `open` is an initial value in practice, not a controlled one: React 19
          special-cases <details> only to attach the `toggle` listener, and
          attributes are re-applied only when the prop value changes. `index === 0`
          never changes, so sections she opened stay open across re-renders. */}
      {GROUPS.map((group, index) => (
        <details key={group.id} className="group" open={index === 0} onInput={() => markDirty(group.id)}>
          <summary className="group-summary">
            <span className="grow">{group.title}</span>
            {dirty.includes(group.id) && <span className="chip pending">alterado</span>}
          </summary>
          {group.fields.map((field) => (
            <div key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              <textarea id={field.name} name={field.name} defaultValue={values[field.name] ?? ''} />
            </div>
          ))}
        </details>
      ))}

      {state.error && <p className="error">{state.error}</p>}

      {/* Sticky to the bottom of the viewport, above the tab bar and above the
          software keyboard — the same --kb mechanism as the reply composer. There
          was previously nothing on screen at all saying there were unsaved
          changes. */}
      <div className="savebar">
        <span className="grow hint" role="status">
          {dirty.length > 0
            ? '● Alterações não salvas'
            : state.ok
              ? 'Salvo! ✓'
              : 'Nenhuma alteração'}
        </span>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar textos'}
        </button>
      </div>
    </form>
  );
}
