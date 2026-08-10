import Link from 'next/link';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { listChurches } from '@/lib/repo/platform';
import { effectiveStatus } from '@/lib/church-status';
import { MigrationDriftAlert } from './MigrationDriftAlert';
import { NewChurchForm } from './NewChurchForm';

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
