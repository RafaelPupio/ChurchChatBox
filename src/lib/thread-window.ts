/** How many messages of a conversation the panel loads and renders.
 *
 *  Chosen, not guessed. The thread is re-queried and re-serialised into the RSC
 *  payload on EVERY poll tick while the screen is open, so this number multiplies
 *  by ~4 a minute against a secretary's mobile data — an unbounded query meant a
 *  400-message pastoral thread left open re-downloaded itself all afternoon.
 *
 *  200 because a church thread is human-paced. WhatsApp's own 24-hour reply
 *  window means an active handoff is at most a day old, and a day of back-and-
 *  forth between a secretary and a member is tens of messages, not hundreds. 200
 *  covers months of ordinary contact with the same person while capping the payload
 *  at a bounded size no matter how long they have been a member. Anything older
 *  is history she scrolls back through rarely — and when it exists, the panel says
 *  so rather than pretending the conversation began where the window starts. */
export const THREAD_WINDOW = 200;

/** The furthest back "carregar mensagens anteriores" will go.
 *
 *  The bound above is not a filing cabinet with the drawer welded shut: a long
 *  pastoral thread's beginning has to stay REACHABLE, or the panel has quietly
 *  deleted it from her point of view. So the window widens on request — but only
 *  on request, and only this far.
 *
 *  A ceiling exists for two separate reasons. The URL is attacker-controlled, so
 *  without one `?anteriores=99999999` is a select of every message a church ever
 *  exchanged with a person, served to whoever is logged in. And an expanded window
 *  is still re-serialised on every poll tick, so an unbounded one re-creates the
 *  exact bug the bound was written to kill. 1000 is five taps of history — far
 *  past anything a church thread reaches in practice — and it is paired with the
 *  slower poll cadence in thread-poll.ts, which is what keeps the widened payload
 *  from being re-downloaded four times a minute. */
export const THREAD_WINDOW_MAX = 1000;

/** What the `?anteriores=` search param resolves to. Pure; the page does no
 *  arithmetic of its own. */
export interface ThreadWindowRequest {
  /** Rows to render. The repo asks the database for `limit + 1`. */
  limit: number;
  /** True once she has widened past the default — the panel polls slower in this
   *  state, and the scroll anchor stops forcing her to the newest message. */
  expanded: boolean;
  /** The value the "carregar mensagens anteriores" link should carry, or null
   *  when the ceiling is already reached and there is nothing honest to offer. */
  nextStep: number | null;
}

/** Resolves the search param into a window. One step is one THREAD_WINDOW of
 *  extra history, so `?anteriores=2` is 600 messages, not 2.
 *
 *  Anything that is not a plain non-negative integer — absent, empty, '3.5',
 *  '-1', 'abc', a repeated param arriving as an array — reads as zero steps
 *  rather than throwing or 404ing. A mangled URL should show her the normal
 *  thread, not an error page. */
export function requestedThreadWindow(
  raw: string | string[] | undefined,
): ThreadWindowRequest {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const steps = typeof first === 'string' && /^\d+$/.test(first) ? Number(first) : 0;

  const limit = Math.min(THREAD_WINDOW * (steps + 1), THREAD_WINDOW_MAX);
  return {
    limit,
    expanded: limit > THREAD_WINDOW,
    // Derived from the CLAMPED limit, not from `steps`: a URL asking for step
    // 9999 is already at the ceiling, and offering it a "load more" link that
    // cannot load more would be a button that does nothing.
    nextStep: limit >= THREAD_WINDOW_MAX ? null : steps + 1,
  };
}

/** Turns the newest-first rows of a bounded query into a chronological thread,
 *  and reports whether older messages exist.
 *
 *  Call it with the result of a query for `limit + 1` rows ordered newest-first:
 *  the extra row is how "there is more history" is detected without a second
 *  COUNT query. */
export function windowThread<T>(
  newestFirst: readonly T[],
  limit: number,
): { messages: T[]; truncated: boolean } {
  // A limit below 1 would make `truncated` true for a thread of one message and
  // return nothing to show it with.
  const size = Math.max(1, Math.floor(limit));
  const truncated = newestFirst.length > size;
  return {
    messages: newestFirst.slice(0, size).reverse(),
    truncated,
  };
}
