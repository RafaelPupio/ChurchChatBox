import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireReadableSession } from '@/lib/auth/writable';
import { effectiveStatus } from '@/lib/church-status';
import { getChurchById } from '@/lib/repo/church-admin';
import { loadConversation } from '@/lib/repo/inbox';
import { isReplyWindowOpen, hoursRemaining } from '@/lib/reply-window';
import { threadPollMs } from '@/lib/thread-poll';
import { threadAnchorKey } from '@/lib/thread-scroll';
import { requestedThreadWindow } from '@/lib/thread-window';
import { AutoRefresh } from '../../AutoRefresh';
import { ReplyForm } from './ReplyForm';
import { EndHandoffButton } from './EndHandoffButton';
import { ThreadBottom } from './ThreadBottom';

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { contactId } = await params;
  const { anteriores } = await searchParams;
  const { churchId } = await requireReadableSession();

  // How far back she has asked to see. Parsed and clamped in thread-window.ts —
  // this value reaches a SQL LIMIT, so it is never trusted from the URL.
  const view = requestedThreadWindow(anteriores);

  const convo = await loadConversation(churchId, contactId, view.limit);
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

  /** How fast, never whether. Every open thread polls.
   *
   *  This replaced a boolean gate that switched polling OFF for a bot-mode
   *  contact and for a suspended church. Both of those left a screen that stops
   *  reflecting reality with nothing on it to say so — and the bot-mode case
   *  killed the update for the escalation moment, the one event in this product
   *  worth watching for. The cadences and the full reasoning for each case,
   *  including suspension, are in src/lib/thread-poll.ts.
   *
   *  Deliberately NOT gated on `open`: an expired 24h window is exactly when she
   *  is waiting for the member to write back, and an inbound message reopens it.
   *  That is the poll earning its cost, not wasting it. */
  const pollMs = threadPollMs({ mode: convo.contact.mode, suspended, expanded: view.expanded });

  return (
    <div>
      {/* Deliberately compact, and deliberately not `.row`. The old header spent
          ~180px of an 812px phone screen before a single message was visible: a
          24px <h1> wrapping a three-line name beside a two-line button, and the
          mobile `.row > .grow { flex-basis: 100% }` rule would have put the button
          on a fourth line of its own. `.thread-head` keeps the name and the
          control on one line at 18px.

          Not sticky either: a second sticky element at top: 0 slides under the app
          bar (z-index 20) and vanishes. It does not need to be — the thread scrolls
          inside itself now, so the page barely moves. */}
      <div className="thread-head">
        {/* The tab bar reaches Caixa in one tap, but leaving a conversation is a
            back motion and there was nothing on this screen that looked like one. */}
        <Link className="back" href="/admin/caixa" aria-label="Voltar para a Caixa de Entrada">←</Link>
        <div className="grow">
          <h1 className="thread-title">{convo.contact.name || convo.contact.phone}</h1>
          {convo.contact.name && <p className="hint thread-sub">{convo.contact.phone}</p>}
        </div>
        {convo.contact.mode === 'human' && <EndHandoffButton contactId={contactId} />}
      </div>

      <Link href={`/admin/caixa/${contactId}/dados`} className="btnlink">
        Dados e privacidade
      </Link>

      {/* A member's reply reaches the database through the webhook and nothing
          tells this browser about it. Without a poll the thread is a snapshot of
          whenever the page happened to load. */}
      <AutoRefresh intervalMs={pollMs} />

      <div className="thread">
        {/* Said out loud, never silent: she may well be scrolling back looking for
            something older, and a thread that simply begins partway through with no
            explanation reads as lost history. Now it is also a way back INTO that
            history — a notice that older messages exist and cannot be opened is
            only marginally better than losing them. */}
        {convo.truncated && (
          <div className="thread-older">
            <span className="hint">
              Mostrando as {view.limit} mensagens mais recentes desta conversa.
            </span>
            {view.nextStep === null ? (
              <span className="hint">Este é o máximo que o painel carrega de uma vez.</span>
            ) : (
              <Link
                className="btnlink"
                // scroll={false} is load-bearing, not tidiness: Next resets the
                // scroll to the top of the page on navigation by default, which
                // on a thread would throw her away from what she was reading at
                // the exact moment she asked for more of it.
                scroll={false}
                href={`/admin/caixa/${contactId}?anteriores=${view.nextStep}`}
              >
                Carregar mensagens anteriores
              </Link>
            )}
          </div>
        )}
        {convo.messages.length === 0 && <span className="hint">Sem mensagens.</span>}
        {convo.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.direction === 'outbound' ? 'out' : 'in'}`}>
            {m.body ?? (m.direction === 'inbound' ? '📎 mídia recebida' : '')}
          </div>
        ))}
        {/* The NEWEST MESSAGE'S ID, not the count. A truncated thread returns
            exactly THREAD_WINDOW rows forever, so the count stops changing the
            moment the bound bites and the anchor silently dies with it. */}
        <ThreadBottom newestId={threadAnchorKey(convo.messages)} landOnOpen={!view.expanded} />
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
