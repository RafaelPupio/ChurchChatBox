/** How much of a residual still counts as "at the bottom".
 *
 *  IT IS A ROUNDING ALLOWANCE, NOT A BUBBLE BUDGET, and the difference is the
 *  whole of the bug it comes out of. It replaces NEAR_BOTTOM_PX = 120, which was
 *  sized to be about one bubble tall because the distance it judged was read
 *  AFTER the new bubbles were already in the DOM — so the slack had to be big
 *  enough to swallow whatever had just arrived. That made "how much arrived" and
 *  "how far she has scrolled away" the same number, and any constant loses to a
 *  big enough burst.
 *
 *  This number judges a distance read at the moment she last MOVED the scroll,
 *  when nothing has arrived yet, so it has nothing to absorb but measurement
 *  noise: scrollHeight and clientHeight are rounded integers while scrollTop is
 *  fractional under browser zoom, so a scroller parked at its end subtracts to a
 *  pixel or two rather than to exactly 0. Overscroll needs no allowance at all —
 *  iOS rubber-band makes the distance negative, which is already past the end.
 *
 *  It must stay far below one bubble (~42px). Grown to bubble size it stops being
 *  a tolerance and quietly becomes a budget again — the thing that broke. */
export const AT_BOTTOM_TOLERANCE_PX = 4;

/** The three numbers every scroll container answers with, passed as values so the
 *  arithmetic can be tested. `scrollTop` is `window.scrollY` and `clientHeight`
 *  is `window.innerHeight` when the page itself is the scroller. */
export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/** Unscrolled content below the fold. Negative during overscroll. */
export function distanceFromBottomPx({
  scrollHeight,
  scrollTop,
  clientHeight,
}: ScrollMetrics): number {
  return scrollHeight - scrollTop - clientHeight;
}

/** Whether this scroll position is the end of the thread.
 *
 *  WHEN this is asked is what makes it mean anything. Asked while she is
 *  scrolling, it is her position and her intent. Asked after new content has been
 *  appended, it is a measurement of the content — see AT_BOTTOM_TOLERANCE_PX. */
export function isAtBottom(metrics: ScrollMetrics): boolean {
  return distanceFromBottomPx(metrics) <= AT_BOTTOM_TOLERANCE_PX;
}

/** What identifies "the thread has moved on" for the scroll anchor.
 *
 *  THE BUG THIS EXISTS TO KILL. The anchor used to re-run on the message COUNT.
 *  That was correct only until the thread query was bounded, and then it broke
 *  silently and permanently: `windowThread` returns exactly `limit` rows for any
 *  truncated conversation, so a new message slides the window without changing
 *  its length. The count is pinned at 200 forever, the effect never fires again,
 *  and she is never landed on the newest message — with no error, no warning and
 *  nothing on screen to suggest anything is wrong. Auto-scroll that works for a
 *  thread's first 200 messages and then quietly dies is worse than auto-scroll
 *  that never worked, because nobody will think to check it.
 *
 *  The identity of the newest row is the thing that actually changes when a
 *  message arrives, at any thread length. Null for an empty thread, which is a
 *  stable key — an empty thread has no newest message to land on. */
export function threadAnchorKey(messages: readonly { id: string }[]): string | null {
  return messages.length === 0 ? null : messages[messages.length - 1].id;
}

export interface ScrollDecision {
  firstRun: boolean;
  /** False when she is looking at a widened window: she asked for older
   *  messages, so the newest one is not where she wants to be put. */
  landOnOpen: boolean;
  /** Was she at the bottom IMMEDIATELY BEFORE this update — not after it.
   *
   *  A boolean, not a distance, on purpose: a distance invites the caller to
   *  measure it at whatever moment happens to be convenient, and the only moment
   *  that answers this question is one where the newly arrived messages are not
   *  yet part of the sum. ThreadBottom keeps it from her scroll events. */
  wasAtBottom: boolean;
}

/** Whether the anchor should pull the view down to the newest message.
 *
 *  Two jobs, and they pull against each other. Opening a thread must land on the
 *  newest message — otherwise every visit starts at the oldest one, a page of
 *  thumb-scrolling before she can read what was just asked. But a message that
 *  arrives while she is scrolled back through history must NOT yank her out of
 *  it; that would happen every time the poll ticked, on the exact screen where
 *  she is trying to read something.
 *
 *  So: land unconditionally on open, and after that only when she was already at
 *  the bottom. Loading older messages is neither — see landOnOpen.
 *
 *  HOW MANY MESSAGES ARRIVED IS NOT AN INPUT, and that is the fix. It used to be,
 *  implicitly: the caller passed a distance read after the new bubbles were in the
 *  DOM. Measured in Chrome at 375x812, three short messages in one tick grew the
 *  document by 131.0px and two two-line ones by 127.0px — both past the 120px
 *  slack — so auto-follow switched off although she had not moved a pixel. And it
 *  never came back ON ITS OWN: measured across the four messages after the burst,
 *  the reading went 130.5, 174.5, 217.5, 261.5, 304.5px, one bubble further out
 *  every time. The only escape was to scroll to the bottom by hand, which she has
 *  no reason to know she needs to do, because nothing on screen says anything is
 *  wrong. A bigger constant buys a bigger burst and keeps the shape of the
 *  failure; asking the question one moment earlier removes it. */
export function shouldScrollToNewest({
  firstRun,
  landOnOpen,
  wasAtBottom,
}: ScrollDecision): boolean {
  if (firstRun) return landOnOpen;
  return wasAtBottom;
}
