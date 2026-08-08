/** How close to the bottom still counts as "she is following the conversation".
 *  Evaluated after the new message is already in the DOM, so the slack has to be
 *  roughly one bubble tall. */
export const NEAR_BOTTOM_PX = 120;

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
  distanceFromBottomPx: number;
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
 *  So: land on open, and after that only when she was already at the bottom. */
export function shouldScrollToNewest({
  firstRun,
  distanceFromBottomPx,
}: ScrollDecision): boolean {
  if (firstRun) return true;
  return distanceFromBottomPx <= NEAR_BOTTOM_PX;
}
