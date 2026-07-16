import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { loadConversation } from '@/lib/repo/inbox';
import { isReplyWindowOpen, hoursRemaining } from '@/lib/reply-window';
import { ReplyForm } from './ReplyForm';
import { EndHandoffButton } from './EndHandoffButton';

export default async function ConversationPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const { churchId } = await requireSession();

  const convo = await loadConversation(churchId, contactId);
  if (!convo) notFound();

  const now = new Date();
  const open = isReplyWindowOpen(convo.contact.lastInboundAt, now);
  const hrs = hoursRemaining(convo.contact.lastInboundAt, now);

  return (
    <div>
      <div className="row">
        <h1 className="grow">{convo.contact.name || convo.contact.phone}</h1>
        {convo.contact.mode === 'human' && <EndHandoffButton contactId={contactId} />}
      </div>

      <div className="thread">
        {convo.messages.length === 0 && <span className="hint">Sem mensagens.</span>}
        {convo.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.direction === 'outbound' ? 'out' : 'in'}`}>{m.body ?? ''}</div>
        ))}
      </div>

      {open ? (
        <ReplyForm contactId={contactId} hoursRemaining={hrs} />
      ) : (
        <p className="error">A janela de 24 horas do WhatsApp expirou. Só é possível responder até 24h após a última mensagem da pessoa.</p>
      )}
    </div>
  );
}
