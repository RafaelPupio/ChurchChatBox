import { notFound } from 'next/navigation';
import { requireReadableSession } from '@/lib/auth/writable';
import { effectiveStatus } from '@/lib/church-status';
import { getChurchById } from '@/lib/repo/church-admin';
import { loadConversation } from '@/lib/repo/inbox';
import { isReplyWindowOpen, hoursRemaining } from '@/lib/reply-window';
import { THREAD_WINDOW } from '@/lib/thread-window';
import { AutoRefresh } from '../../AutoRefresh';
import { ReplyForm } from './ReplyForm';
import { EndHandoffButton } from './EndHandoffButton';
import { ThreadBottom } from './ThreadBottom';

export default async function ConversationPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const { churchId } = await requireReadableSession();

  const convo = await loadConversation(churchId, contactId);
  if (!convo) notFound();

  const now = new Date();
  const open = isReplyWindowOpen(convo.contact.lastInboundAt, now);
  const hrs = hoursRemaining(convo.contact.lastInboundAt, now);

  // Free: the layout already read this row on this render, and getChurchById is
  // memoised per request.
  const church = await getChurchById(churchId);
  const suspended = church
    ? effectiveStatus(church.status, church.graceUntil, now) === 'suspended'
    : false;

  /** Poll only while there is genuinely something to wait for.
   *
   *  This used to be mounted unconditionally, which meant every open thread polled
   *  forever — including the two cases where a tick can never produce anything the
   *  secretary can act on. A bot-mode contact is being answered automatically;
   *  nobody is standing by for that thread, and if the member does ask for a human
   *  the handoff shows up the next time the inbox is opened. A suspended church is
   *  read-only AND its bot is switched off, so no new message is coming at all —
   *  and billing a stopped subscription for Neon compute every fifteen seconds is
   *  the vendor paying to poll on behalf of someone who is not paying.
   *
   *  Deliberately NOT gated on `open`: an expired 24h window is exactly when she is
   *  waiting for the member to write back, and an inbound message reopens it. That
   *  is the poll earning its cost, not wasting it. */
  const worthPolling = convo.contact.mode === 'human' && !suspended;

  return (
    <div>
      <div className="row">
        <h1 className="grow">{convo.contact.name || convo.contact.phone}</h1>
        {convo.contact.mode === 'human' && <EndHandoffButton contactId={contactId} />}
      </div>

      {/* A member's reply reaches the database through the webhook and nothing
          tells this browser about it. Without a poll the thread is a snapshot of
          whenever the page happened to load. */}
      {worthPolling && <AutoRefresh />}

      <div className="thread">
        {/* Said out loud, never silent: she may well be scrolling back looking for
            something older, and a thread that simply begins partway through with no
            explanation reads as lost history. */}
        {convo.truncated && (
          <span className="hint">
            Mostrando as {THREAD_WINDOW} mensagens mais recentes desta conversa. As anteriores não
            aparecem aqui.
          </span>
        )}
        {convo.messages.length === 0 && <span className="hint">Sem mensagens.</span>}
        {convo.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.direction === 'outbound' ? 'out' : 'in'}`}>
            {m.body ?? (m.direction === 'inbound' ? '📎 mídia recebida' : '')}
          </div>
        ))}
        <ThreadBottom count={convo.messages.length} />
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
