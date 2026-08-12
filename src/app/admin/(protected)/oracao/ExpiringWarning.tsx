'use client';

import { useState } from 'react';

/** Rendered ONLY when count > 0. There is deliberately no empty state: a standing
 *  "0 pedidos vão ser apagados" line is the 90-day failure in another form. */
export function ExpiringWarning({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<{ date: string; cursor: string } | null>(null);

  if (count <= 0) return null;

  async function download(apos?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dados/oracoes-expirando${apos ? `?apos=${encodeURIComponent(apos)}` : ''}`);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      const parsed = JSON.parse(text) as { aviso?: string; continuacao?: string };
      const href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = href;
      a.download = 'pedidos-de-oracao-a-expirar.json';
      a.click();
      URL.revokeObjectURL(href);
      setTruncated(parsed.continuacao
        ? { date: (parsed.aviso ?? '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? '', cursor: parsed.continuacao }
        : null);
    } catch {
      setError('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  // `.alarm .alarm-warn` is the repo's amber box, and it styles its own h2 and p.
  return (
    <section className="alarm alarm-warn">
      <h2>Pedidos de oração que serão apagados em breve</h2>
      <p>
        {count} pedido(s) de oração completam 12 meses nos próximos 30 dias e serão apagados
        automaticamente. Se a igreja quiser guardar esse histórico, baixe a cópia antes — depois
        de apagados não há como recuperar.
      </p>
      <p>
        A limpeza acontece mesmo que ninguém baixe o arquivo. Este aviso é uma cortesia, não um
        pedido de autorização.
      </p>
      <div className="item-actions">
        <button type="button" className="primary" onClick={() => download()} disabled={busy}>
          Baixar os pedidos que serão apagados (JSON)
        </button>
      </div>
      <p>
        O arquivo traz o nome e o número de quem fez cada pedido, junto com o texto. É o arquivo
        mais sensível do sistema: guarde em lugar seguro e não compartilhe fora da equipe.
      </p>
      {error && <p className="error">{error}</p>}
      {truncated && (
        <>
          <p>
            O arquivo ficou grande demais e foi até {truncated.date}. Baixe o restante no botão
            abaixo e guarde os dois arquivos.
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
