'use client';

import { useActionState, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { IMAGE_ACCEPT_ATTRIBUTE, validateImageFile } from '@/lib/image-upload';
import { LIST_ROW_TITLE_MAX, truncateRowTitle } from '@/lib/list-row-title';
import { prepareImage } from './prepare-image';
import type { ItemFormState } from './item-actions';

/** No `kind`. Every item this form creates is a content item, and an existing
 *  item's kind comes from its row in editItem — it is not a form field and there
 *  is no hidden input carrying it. */
export interface ItemFormValues {
  label: string;
  bodyText: string;
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
  const [label, setLabel] = useState<string>(values.label);
  const [imageUrl, setImageUrl] = useState<string>(values.imageUrl ?? '');
  /** What the thumbnail shows. Separate from `imageUrl` because it holds a local
   *  object URL while the upload is still running — on a camera roll of thousands,
   *  confirming she picked the right photo is most of the point of a preview, and
   *  waiting for the round-trip to show it defeats that on church wifi. */
  const [preview, setPreview] = useState<string>(values.imageUrl ?? '');
  const [removed, setRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  /* Computed with the SENDER's own function, not a character count. The cap is 24
     UTF-16 code units — ⛪ costs 1, 🙏 costs 2 — so a counter saying "caracteres"
     would be wrong for exactly the labels this product encourages. Showing the
     real cut string needs no explanation and cannot drift from what members get.
     validateLabel checks non-empty only, so until now "📍 Endereço e como chegar"
     saved cleanly, showed in full here forever, and arrived on every member's
     phone as "📍 Endereço e como chega" with nothing anywhere saying so. */
  const cut = label.length > LIST_ROW_TITLE_MAX ? truncateRowTitle(label) : '';

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    // Captured synchronously: `currentTarget` is null by the time the awaits below
    // resolve, and the element is needed again at the end to clear its value.
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setUploadError('');
    setUploading(true);
    let localPreview = '';
    try {
      /* CONVERSION RUNS FIRST, AND THE ORDER IS THE WHOLE POINT. validateImageFile
         rejects a HEIC by design — correctly, while nothing could convert one.
         Run before prepareImage it would go on rejecting the photos this converter
         exists to rescue, and the feature would be dead code. So the file is
         converted, and the allow-list then checks WHAT WILL ACTUALLY BE UPLOADED:
         a JPEG, a PNG, or a GIF that passed through untouched. */
      const prepared = await prepareImage(file);
      if ('error' in prepared) {
        setUploadError(prepared.error);
        return;
      }

      // Still checked before the upload starts, so a refusal is specific instead
      // of the server's generic 400. It now guards the converter's OUTPUT, which
      // is what the route's allowedContentTypes will see. The server allow-list
      // remains the real gate; this is UX and anyone who cares to can bypass it.
      const problem = validateImageFile(prepared.file);
      if (problem) {
        setUploadError(problem);
        return;
      }

      localPreview = URL.createObjectURL(prepared.file);
      setPreview(localPreview);

      // Straight to Vercel Blob via the session-gated token route — the file never
      // passes through a Server Action, so there is no 1 MB body cap.
      const blob = await upload(prepared.file.name, prepared.file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
      });
      setImageUrl(blob.url);
      setPreview(blob.url);
      setRemoved(false);
    } catch {
      setUploadError('O envio não completou. Verifique a conexão e tente de novo — se continuar, fale com o suporte.');
      // Back to whatever was already attached, rather than leaving a thumbnail of
      // a photo that never arrived.
      setPreview(imageUrl);
    } finally {
      if (localPreview) URL.revokeObjectURL(localPreview);
      setUploading(false);
      // Cleared so re-picking the SAME photo after an error still fires onChange —
      // otherwise she picks it again, nothing happens, and the panel looks broken.
      input.value = '';
    }
  }

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
      ) : (
        <p className="hint">Ex.: Horários dos cultos</p>
      )}

      <label htmlFor="bodyText">Resposta que a pessoa recebe</label>
      <textarea id="bodyText" name="bodyText" defaultValue={values.bodyText} />
      {/* Pre-empts the round-trip error "Um item de conteúdo precisa de um texto
          ou de uma imagem", which she otherwise only meets after submitting. */}
      <p className="hint">Pode ser só texto, só uma imagem, ou os dois.</p>

      <label htmlFor="image">Imagem (opcional — ex.: calendário do mês)</label>
      {/* STILL NOT `image/*`, and prepare-image.ts does not make this redundant.
          Naming the concrete formats is what makes iOS's own picker convert the
          photo to JPG before it ever reaches this input — the fastest, most
          reliable path, and the one most secretaries take without noticing. The
          converter is the fallback for every picker that ignores `accept`. */}
      <input id="image" type="file" accept={IMAGE_ACCEPT_ATTRIBUTE} onChange={onFileChange} disabled={uploading} />
      <p className="hint">
        JPG, PNG, WEBP ou GIF, até 10 MB. Fotos de iPhone funcionam — a imagem é reduzida
        automaticamente antes de subir.
      </p>
      {uploading && <p className="hint">⏳ Enviando imagem… não feche esta tela.</p>}
      {uploadError && <p className="error">{uploadError}</p>}
      {preview && (
        <div className="image-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot
              take a blob: object URL, and this is a 72px thumbnail of a file the
              browser already holds. */}
          <img src={preview} alt="Prévia da imagem deste item" />
          <span className="grow hint">{uploading ? 'Enviando…' : 'Imagem anexada ✓'}</span>
          {/* A 44px button, replacing a 13×13px "remover" checkbox that was only
              hittable because a label had been wrapped around it. */}
          <button
            type="button"
            className="danger"
            disabled={uploading}
            onClick={() => { setRemoved(true); setImageUrl(''); setPreview(''); }}
          >
            Remover
          </button>
        </div>
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
