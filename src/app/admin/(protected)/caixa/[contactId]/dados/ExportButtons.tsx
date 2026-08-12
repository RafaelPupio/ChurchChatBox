'use client';

import { useState } from 'react';

/** The route is the only party that knows where it stopped — a row ceiling is
 *  predictable, a 45 s budget is not — so the resume point is written into the
 *  file and read back here. The secretary never sees, types or pastes the cursor:
 *  they see two buttons and hand over two files.
 *
 *  The download is minted from a Blob in the secretary's own browser. Nothing is
 *  written to Vercel Blob: those URLs are public-by-URL and permanent, which is
 *  exactly why the menu-image flow works and exactly why a member export there
 *  would be a durable, unauthenticated, church-unscoped copy of the most
 *  sensitive rows in the system. */
export function ExportButtons({ contactId }: { contactId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<{ date: string; cursor: string } | null>(null);

  async function download(apos?: string) {
    setBusy(true);
    setError(null);
    try {
      const url = `/api/dados/${contactId}${apos ? `?apos=${encodeURIComponent(apos)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      const parsed = JSON.parse(text) as { aviso?: string; continuacao?: string };

      const blob = new Blob([text], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `dados-membro-${contactId.slice(0, 6)}.json`;
      a.click();
      URL.revokeObjectURL(href);

      setTruncated(
        parsed.continuacao
          ? { date: (parsed.aviso ?? '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? '', cursor: parsed.continuacao }
          : null,
      );
    } catch {
      setError('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="item-actions">
        <button type="button" className="primary" onClick={() => download()} disabled={busy}>
          Baixar cópia dos dados (JSON)
        </button>
      </div>
      <p className="hint">
        O arquivo é gerado na hora e não fica guardado no sistema. Ele contém dados pessoais:
        entregue apenas à própria pessoa e apague do computador depois.
      </p>
      {error && <p className="error">{error}</p>}
      {truncated && (
        <>
          <p className="warn">
            O arquivo ficou grande demais e foi até {truncated.date}. Baixe o restante no botão
            abaixo e entregue os dois arquivos à pessoa.
          </p>
          <div className="item-actions">
            <button type="button" onClick={() => download(truncated.cursor)} disabled={busy}>
              Baixar o restante (a partir de {truncated.date})
            </button>
          </div>
        </>
      )}
    </section>
  );
}
