import { notFound } from 'next/navigation';
import { requireReadableSession } from '@/lib/auth/writable';
import { loadConversation } from '@/lib/repo/inbox';
import { isReplyWindowOpen, hoursRemaining } from '@/lib/reply-window';
import { ReplyForm } from './ReplyForm';
import { EndHandoffButton } from './EndHandoffButton';

export default async function ConversationPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const { churchId } = await requireReadableSession();

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
          <div key={m.id} className={`bubble ${m.direction === 'outbound' ? 'out' : 'in'}`}>
            {m.body ?? (m.direction === 'inbound' ? '📎 mídia recebida' : '')}
          </div>
        ))}
      </div>

      {/* Reply only for an active handoff: a reply to a bot-mode contact would send,
          but the bot would still answer their next message — an interleaved thread.
          Mirror the EndHandoffButton's mode === 'human' gate. */}
      {convo.contact.mode !== 'human' ? (
        <p className="hint">Esta conversa não está em atendimento humano — o bot responde automaticamente. Para responder por aqui, a pessoa precisa pedir um atendente.</p>
      ) : open ? (
        <ReplyForm contactId={contactId} hoursRemaining={hrs} />
      ) : (
        <p className="error">A janela de 24 horas do WhatsApp expirou. Só é possível responder até 24h após a última mensagem da pessoa.</p>
      )}
    </div>
  );
}
