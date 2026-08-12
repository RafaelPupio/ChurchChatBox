import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireReadableSession } from '@/lib/auth/writable';
import { countMemberRows, loadMemberSubject } from '@/lib/repo/member-data';
import { isReplyWindowOpen } from '@/lib/reply-window';
import { DeleteForm } from './DeleteForm';
import { ExportButtons } from './ExportButtons';
import { NameForm } from './NameForm';

/** requireReadableSession is MANDATORY here — tests/privilege-boundary.test.ts
 *  fails any protected page that does not use it. The data-rights guard is for the
 *  ACTIONS, not for the page. */
export default async function MemberDataPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const { churchId } = await requireReadableSession();

  const contact = await loadMemberSubject(churchId, contactId);
  if (!contact) notFound();

  const counts = await countMemberRows(churchId, contactId);
  const now = new Date();
  const inFlight = contact.mode === 'human' && isReplyWindowOpen(contact.lastInboundAt, now);
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR') : '—');

  return (
    <main className="container">
      <Link href={`/admin/caixa/${contactId}`} className="back">← Voltar para a conversa</Link>

      <h1>Dados desta pessoa</h1>
      <p className="hint">
        Tudo o que a igreja guarda sobre esta pessoa. Use esta página quando alguém pedir uma
        cópia dos seus dados, a correção do nome ou a exclusão de tudo (LGPD, art. 18).
      </p>
      <p className="hint">
        Se o número da pessoa não aparece na Caixa de Entrada, a igreja não guarda nada sobre
        ela — pode responder isso.
      </p>

      <section className="card">
        {/* .grow carries overflow-wrap: break-word — this line is long and full of
            data, and it must not push document.scrollWidth past 375px. */}
        <p className="grow">
          <strong>Cadastro:</strong> nome e número de WhatsApp · <strong>Mensagens:</strong>{' '}
          {counts.messages} · <strong>Pedidos de oração:</strong> {counts.prayers} ·{' '}
          <strong>Primeiro registro:</strong> {fmt(contact.createdAt)} ·{' '}
          <strong>Última mensagem recebida:</strong> {fmt(contact.lastInboundAt)}
        </p>
      </section>

      <NameForm contactId={contactId} currentName={contact.name} />

      <p className="hint">
        As mensagens e os pedidos de oração não podem ser editados: são o registro do que foi
        dito. Se a pessoa quiser que algo saia daqui, a saída é apagar os dados dela.
      </p>

      <ExportButtons contactId={contactId} />

      <DeleteForm contactId={contactId} prayersNovo={counts.prayersNovo} inFlight={inFlight} />
    </main>
  );
}
