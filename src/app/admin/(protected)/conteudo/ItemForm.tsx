'use client';

import { useActionState, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { IMAGE_ACCEPT_ATTRIBUTE, validateImageFile } from '@/lib/image-upload';
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
  const [removed, setRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Checked before the upload starts, so the reason is specific ("this is a
    // HEIC, here is the iPhone setting that fixes it") instead of the generic
    // failure the server's rejection produced. The server allow-list is still the
    // gate — this check is UX and can be bypassed by anyone who cares to.
    const problem = validateImageFile(file);
    if (problem) {
      setUploadError(problem);
      // Cleared so picking the SAME file again still fires onChange — otherwise
      // she re-picks the photo, nothing happens, and the panel looks broken.
      event.target.value = '';
      return;
    }

    setUploadError('');
    setUploading(true);
    try {
      // Straight to Vercel Blob via the session-gated token route — the file never
      // passes through a Server Action, so there is no 1 MB body cap.
      const blob = await upload(file.name, file, { access: 'public', handleUploadUrl: '/api/blob/upload' });
      setImageUrl(blob.url);
      setRemoved(false);
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
      {/* Not `image/*`: that offer is what makes an iPhone hand over a HEIC the
          WhatsApp API cannot render. Naming the four formats makes iOS's own
          picker convert the photo to JPG before it ever reaches this input. */}
      <input id="image" type="file" accept={IMAGE_ACCEPT_ATTRIBUTE} onChange={onFileChange} disabled={uploading} />
      <p className="hint">Formatos aceitos: JPG, PNG, WEBP ou GIF, até 10 MB.</p>
      {uploading && <p className="hint">Enviando imagem…</p>}
      {uploadError && <p className="error">{uploadError}</p>}
      {imageUrl && (
        <p className="hint">
          Imagem anexada ✓{' '}
          {/* The label is the tap target, not the 22px box inside it. */}
          <label style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
            <input
              type="checkbox"
              checked={removed}
              onChange={(e) => { setRemoved(e.target.checked); if (e.target.checked) setImageUrl(''); }}
            /> remover
          </label>
        </p>
      )}
      {/* The Server Action reads only this URL string, not the file itself. */}
      <input type="hidden" name="imageUrl" value={imageUrl} />
      {/* Persists past the checkbox unmounting (imageUrl clears on check) so the
          removal intent still reaches the Server Action on submit. */}
      <input type="hidden" name="removeImage" value={removed ? 'on' : ''} />

      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending || uploading} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : submitLabel}
      </button>
    </form>
  );
}
