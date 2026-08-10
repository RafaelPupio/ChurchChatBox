import Link from 'next/link';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { listChurches } from '@/lib/repo/platform';
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
  const churches = await listChurches();
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
      <p className="hint">{churches.length} igreja(s) cadastrada(s).</p>

      <NewChurchForm />

      {churches.length === 0 && <p className="hint">Nenhuma igreja ainda.</p>}

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
    </div>
  );
}
