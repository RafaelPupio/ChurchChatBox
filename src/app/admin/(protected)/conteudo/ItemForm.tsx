'use client';

import { useActionState, useState } from 'react';
import { upload } from '@vercel/blob/client';
import type { ItemFormState } from './item-actions';

export interface ItemFormValues {
  label: string;
  bodyText: string;
  kind: 'content' | 'prayer' | 'human';
  imageUrl: string | null;
}

const initial: ItemFormState = {};

export function ItemForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  values: ItemFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [imageUrl, setImageUrl] = useState<string>(values.imageUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      // Straight to Vercel Blob via the session-gated token route — the file never
      // passes through a Server Action, so there is no 1 MB body cap.
      const blob = await upload(file.name, file, { access: 'public', handleUploadUrl: '/api/blob/upload' });
      setImageUrl(blob.url);
    } catch {
      setUploadError('Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="card">
      <label htmlFor="label">Rótulo (aparece no menu)</label>
      <input id="label" name="label" type="text" defaultValue={values.label} required />

      <label htmlFor="kind">Tipo</label>
      <select id="kind" name="kind" defaultValue={values.kind}>
        <option value="content">Conteúdo (responde com um texto/imagem)</option>
        <option value="prayer">Pedido de oração</option>
        <option value="human">Falar com atendente</option>
      </select>

      <label htmlFor="bodyText">Texto da resposta</label>
      <textarea id="bodyText" name="bodyText" defaultValue={values.bodyText} />
      <p className="hint">Deixe em branco para itens de oração ou atendente.</p>

      <label htmlFor="image">Imagem (opcional — ex.: calendário do mês)</label>
      <input id="image" type="file" accept="image/*" onChange={onFileChange} disabled={uploading} />
      {uploading && <p className="hint">Enviando imagem…</p>}
      {uploadError && <p className="error">{uploadError}</p>}
      {imageUrl && (
        <p className="hint">
          Imagem anexada ✓{' '}
          <label style={{ display: 'inline' }}>
            <input type="checkbox" name="removeImage" onChange={(e) => { if (e.target.checked) setImageUrl(''); }} /> remover
          </label>
        </p>
      )}
      {/* The Server Action reads only this URL string, not the file itself. */}
      <input type="hidden" name="imageUrl" value={imageUrl} />

      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending || uploading} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : submitLabel}
      </button>
    </form>
  );
}
