import type { ContactMode } from '@/lib/types';

/** An open handoff, at the default window: someone is standing at the screen
 *  waiting for a person to write back, and fifteen seconds is short enough that
 *  she never reaches for the reload button. */
export const THREAD_POLL_FAST_MS = 15_000;

/** Everything else that is still worth watching.
 *
 *  This number replaces a `null`. The previous version of this gate turned the
 *  poll OFF for a bot-mode contact, on the reasoning that nobody is standing by
 *  for a thread the bot is answering. That got the product exactly backwards.
 *  "quero falar com um atendente" is the single most valuable event this system
 *  produces, and a bot-mode thread is precisely where it happens — so the one
 *  case that stopped updating was the one that mattered. Worse, it failed
 *  silently: the inbox list does not poll either, so the promised fallback ("it
 *  shows up next time the inbox is opened") meant she had to navigate away and
 *  back, which nobody would think to do because nothing on screen suggests the
 *  page has gone stale.
 *
 *  Sixty seconds, not fifteen, because the value and the cost are both real:
 *
 *  - A tick is ~4 queries (layout + page), so this is 4 a minute against 16 — a
 *    4x saving on the case that is genuinely idle most of the time, while still
 *    bounding "she learns the member asked for a person" at one minute instead
 *    of never.
 *  - The member is not sitting in silence during that minute: the bot answers
 *    the handoff request itself, so the latency is invisible from their side.
 *    Nobody is waiting on the panel to render before a human is told they were
 *    asked for.
 *  - It is well under the span where a person decides the screen is broken and
 *    reloads by hand, which is the behaviour polling exists to prevent.
 *
 *  It is also the cadence for a WIDENED window: 1000 messages re-serialised every
 *  fifteen seconds would re-create the payload bug that the thread bound was
 *  written to fix. Reading history is a deliberate, temporary act, and one minute
 *  is the right trade while she is doing it. Leaving the thread and coming back
 *  drops the search param and restores the fast cadence. */
export const THREAD_POLL_SLOW_MS = 60_000;

export interface ThreadPollInput {
  mode: ContactMode;
  /** Church subscription suspended (grace period already elapsed). */
  suspended: boolean;
  /** She has tapped "carregar mensagens anteriores" at least once. */
  expanded: boolean;
}

/** How often an open thread should refresh itself. Pure, and never null: EVERY
 *  open thread polls now.
 *
 *  A screen that silently stops reflecting reality is a worse failure than a
 *  screen that costs a query a minute, because there is no signal she could act
 *  on — she cannot tell a quiet conversation from a frozen one. So the decision
 *  here is only ever how FAST, never whether.
 *
 *  SUSPENDED, decided deliberately and separately. It also polls, at the slow
 *  cadence. The gate this replaces skipped it on the claim that "its bot is
 *  switched off, so no new message is coming at all" — which is simply not true
 *  of this codebase. The webhook's suspension gate sits BELOW routing on purpose
 *  (src/app/api/whatsapp/webhook/route.ts): a suspended church stops SENDING but
 *  keeps recording every inbound message and keeps persisting mode transitions.
 *  So a member of a suspended church can still write in, and can still be flipped
 *  to `human` — those rows land in the database and the panel is allowed to show
 *  them. She cannot reply, and the layout banner says so, but the banner promises
 *  read-only, not frozen; a secretary reading her members' unanswered messages is
 *  exactly the thing that gets the invoice paid. At one query a minute, only while
 *  the tab is actually in front (AutoRefresh pauses on hidden), that is not a cost
 *  worth showing anyone a dead screen over. */
export function threadPollMs({ mode, suspended, expanded }: ThreadPollInput): number {
  const activeHandoff = mode === 'human' && !suspended;
  return activeHandoff && !expanded ? THREAD_POLL_FAST_MS : THREAD_POLL_SLOW_MS;
}
