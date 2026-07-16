'use client';

import { useActionState } from 'react';
import { saveTexts, type ConfigResult } from './actions';

const initial: ConfigResult = {};

const FIELDS: { name: string; label: string }[] = [
  { name: 'greetingText', label: 'Saudação (primeiro contato)' },
  { name: 'menuHeaderText', label: 'Cabeçalho do menu' },
  { name: 'menuButtonLabel', label: 'Rótulo do botão do menu (ex.: Ver opções)' },
  { name: 'fallbackText', label: 'Mensagem quando não entende' },
  { name: 'unsupportedMediaText', label: 'Mensagem para áudio/figurinha/foto' },
  { name: 'errorText', label: 'Mensagem de instabilidade' },
  { name: 'prayerPromptText', label: 'Pedir o texto da oração' },
  { name: 'prayerThanksText', label: 'Agradecimento do pedido de oração' },
  { name: 'handoffText', label: 'Ao encaminhar para um atendente' },
  { name: 'handoffClosedText', label: 'Ao encerrar o atendimento' },
];

export function TextsForm({ values }: { values: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(saveTexts, initial);

  return (
    <form action={formAction} className="card">
      <h2 style={{ marginTop: 0 }}>Textos do bot</h2>
      <p className="hint">Tudo o que a secretária virtual diz. Edite e salve — muda na hora.</p>

      <label htmlFor="name">Nome da igreja</label>
      <input id="name" name="name" type="text" defaultValue={values.name ?? ''} />

      {FIELDS.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name}>{f.label}</label>
          <textarea id={f.name} name={f.name} defaultValue={values[f.name] ?? ''} />
        </div>
      ))}

      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p style={{ color: 'var(--ok)' }}>Salvo! ✓</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : 'Salvar textos'}
      </button>
    </form>
  );
}
