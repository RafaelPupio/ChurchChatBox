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
