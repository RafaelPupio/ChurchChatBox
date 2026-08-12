import Link from 'next/link';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { listChurches, listErasureSignals } from '@/lib/repo/platform';
import { effectiveStatus } from '@/lib/church-status';
import { timeAgo } from '@/lib/relative-time';
import { MigrationDriftAlert } from './MigrationDriftAlert';
import { NewChurchForm } from './NewChurchForm';
import { WebhookFailureAlert } from './WebhookFailureAlert';

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  suspended: 'Suspensa',
};

export default async function OwnerChurchesPage() {
  await requireOwnerSession();

  // The church list is fetched DEFENSIVELY, and this is the whole point of the
  // page. `listChurches` selects every column of `church`, so the exact failure
  // the two alarms below exist to report — a migration adding a column that the
  // live database does not have — throws here. Before this guard that happened
  // BEFORE any JSX existed, so the alarms never rendered and Rafael got Next's
  // default 500 with no error.tsx to soften it: an alarm system switched off by
  // the emergency it was built for. Each alarm carefully defended its own read;
  // nothing defended the page hosting them.
  //
  // On failure the list is dropped and the alarms still render, because they are
  // the only thing on this screen that matters while the database is behind.
  let churches: Awaited<ReturnType<typeof listChurches>> = [];
  let listFailed = false;
  try {
    churches = await listChurches();
  } catch (error) {
    console.error('[owner] church list failed — rendering the alarms alone:', error);
    listFailed = true;
  }
  // Same defensive pattern as the church list above: a failure here must not take
  // down the console, which is also where migration-drift alarms surface.
  let signals: Awaited<ReturnType<typeof listErasureSignals>> = [];
  try {
    signals = await listErasureSignals(100);
  } catch (error) {
    console.error('[owner] erasure signal list failed — rendering the rest:', error);
  }
  const now = new Date();

  return (
    <div>
      {/* First child, above the heading: if the database is behind the code,
          nothing else on this screen matters until that is fixed. */}
      <MigrationDriftAlert />
      {/* Second: drift is what is about to break, this is what already did.
          Both come before the list — a console that shows churches as fine while
          their members get silence is the thing that failed us twice. */}
      <WebhookFailureAlert />
      <h1>Igrejas</h1>
      {listFailed ? (
        <p className="error">
          Não foi possível carregar a lista de igrejas. Isso quase sempre é a mesma
          causa apontada acima — resolva aquilo primeiro e recarregue esta página.
        </p>
      ) : (
        <p className="hint">{churches.length} igreja(s) cadastrada(s).</p>
      )}

      <NewChurchForm />

      {!listFailed && churches.length === 0 && <p className="hint">Nenhuma igreja ainda.</p>}

      {churches.map((c) => {
        const status = effectiveStatus(c.status, c.graceUntil, now);
        return (
          <Link key={c.id} className="card conv" href={`/owner/${c.id}`}>
            <span className="grow">
              <strong>{c.name}</strong>
              <span className="hint">
                {' '}· {c.whatsappConnected ? 'WhatsApp conectado' : 'WhatsApp não conectado'}
                {' '}· {c.activeMenuItems} item(ns) no menu
                {/* listChurches has always computed this and the page has always
                    thrown it away. It is the honest half of the "receiving but not
                    replying" idea (see src/lib/webhook-failure.ts): a webhook broken
                    the way 2026-08-10's was freezes last_inbound_at for EVERY church
                    at once, so "há 3 dias" down the whole list is that outage's
                    fingerprint. Stated as data, never as an alarm — a quiet church
                    on a Tuesday is also quiet, and guessing which is which is what
                    would make this console unreadable. */}
                {' '}· {c.lastInboundAt
                  ? `última mensagem recebida ${timeAgo(c.lastInboundAt, now)}`
                  : 'nenhuma mensagem recebida ainda'}
              </span>
              {c.activeMenuItems === 0 && (
                <div className="warn">⚠️ Sem itens ativos — o bot não tem o que oferecer.</div>
              )}
            </span>
            <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
          </Link>
        );
      })}

      <section className="card">
        <h2>Exclusões recentes</h2>
        <p className="hint">
          Toda exclusão de dados feita por uma igreja aparece aqui, inclusive quando a assinatura
          está suspensa. Esta lista não mostra de quem eram os dados.
        </p>
        {signals.length === 0 ? (
          <p className="hint">Nenhuma exclusão registrada.</p>
        ) : (
          <ul>
            {/* Index key, deliberately: the projection excludes erasure_record.id
                (it is not needed for "an erasure occurred and for which church"),
                so there is no unique value available — two erasures in one church
                in the same millisecond would collide on any composite key. */}
            {signals.map((s, i) => (
              <li key={i} className="grow">
                {s.createdAt.toLocaleDateString('pt-BR')} · {s.churchName} ·{' '}
                {s.reason === 'retention' ? 'Limpeza automática (12 meses)' : 'Pedido do titular'} ·{' '}
                {s.messagesDeleted} mensagens, {s.prayersDeleted} pedidos de oração,{' '}
                {s.contactsDeleted} cadastros
                {s.status === 'pending' ? ' · pendente' : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
