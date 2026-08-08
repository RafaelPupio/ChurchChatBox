import { describe, it, expect } from 'vitest';
import { NEAR_BOTTOM_PX, shouldScrollToNewest, threadAnchorKey } from '@/lib/thread-scroll';
import { THREAD_WINDOW, windowThread } from '@/lib/thread-window';

/** WHAT THESE TESTS DO AND DO NOT COVER.
 *
 *  The pure half of the auto-scroll — what the effect keys on, and whether it
 *  should fire — is here. The DOM half is not, and cannot be: there is no jsdom
 *  in this repo, and adding it would not help, because jsdom has no layout engine
 *  and reports scrollHeight, clientHeight and scrollTop as 0 for everything. A
 *  test of ThreadBottom's effect under jsdom would compute distanceFromBottomPx
 *  as 0, take the "she is at the bottom" branch every single time, and pass
 *  whether or not the component works. That is a test asserting nothing, so it is
 *  not written. The scroll offsets were measured in a real browser instead and
 *  the numbers are in the commit message. */

/** A message row, as far as the anchor is concerned. */
function msg(id: string) {
  return { id };
}

describe('threadAnchorKey', () => {
  it('is the newest message, which is the last row of a chronological thread', () => {
    expect(threadAnchorKey([msg('a'), msg('b'), msg('c')])).toBe('c');
  });

  it('is null for an empty thread', () => {
    expect(threadAnchorKey([])).toBeNull();
  });

  it('CHANGES when a new message arrives in a thread that is already truncated', () => {
    // This is the whole bug. The anchor used to re-run on the message COUNT, and
    // a truncated thread has a count pinned at exactly THREAD_WINDOW forever:
    // windowThread drops the oldest row for every new one. So the count never
    // moved again, the effect never fired again, and she was silently never
    // landed on the newest message for the rest of the thread's life.
    const rows = (newest: number) =>
      [...Array(THREAD_WINDOW + 1)].map((_, i) => msg(String(newest - i)));

    const before = windowThread(rows(400), THREAD_WINDOW);
    const after = windowThread(rows(401), THREAD_WINDOW);

    // The length is identical — the property that killed the old key.
    expect(after.messages.length).toBe(before.messages.length);
    expect(after.messages.length).toBe(THREAD_WINDOW);

    // The key is not.
    expect(threadAnchorKey(before.messages)).toBe('400');
    expect(threadAnchorKey(after.messages)).toBe('401');
    expect(threadAnchorKey(after.messages)).not.toBe(threadAnchorKey(before.messages));
  });

  it('does NOT change when the window is merely widened', () => {
    // The other half of the same property: more history added at the FRONT is not
    // the thread moving on, so the anchor must not fire and must not drag her to
    // the bottom of history she was reading.
    const rows = [...Array(600)].map((_, i) => msg(String(600 - i)));

    const narrow = windowThread(rows.slice(0, THREAD_WINDOW + 1), THREAD_WINDOW);
    const wide = windowThread(rows.slice(0, THREAD_WINDOW * 2 + 1), THREAD_WINDOW * 2);

    expect(wide.messages.length).toBeGreaterThan(narrow.messages.length);
    expect(threadAnchorKey(wide.messages)).toBe(threadAnchorKey(narrow.messages));
  });

  it('is stable across a re-render that changed nothing', () => {
    // The effect must not fire on every poll tick that returned the same thread —
    // that would be a scroll jump every 15 seconds.
    const rows = [...Array(10)].map((_, i) => msg(String(10 - i)));
    const a = windowThread(rows, THREAD_WINDOW);
    const b = windowThread(rows, THREAD_WINDOW);
    expect(threadAnchorKey(a.messages)).toBe(threadAnchorKey(b.messages));
  });
});

describe('shouldScrollToNewest', () => {
  it('lands on the newest message when the thread opens', () => {
    // Otherwise every visit starts at the OLDEST message with the reply box below
    // the whole history — a page of thumb-scrolling before she can read what was
    // just asked.
    expect(shouldScrollToNewest({ firstRun: true, distanceFromBottomPx: 9999 })).toBe(true);
  });

  it('follows a new message when she is already at the bottom', () => {
    expect(shouldScrollToNewest({ firstRun: false, distanceFromBottomPx: 0 })).toBe(true);
  });

  it('tolerates being roughly one bubble short of the bottom', () => {
    expect(shouldScrollToNewest({ firstRun: false, distanceFromBottomPx: NEAR_BOTTOM_PX })).toBe(
      true,
    );
  });

  it('leaves her alone when she is scrolled back through history', () => {
    // The poll ticks while the thread is open. Without this she would be yanked
    // out of whatever she was reading every time a message arrived.
    expect(
      shouldScrollToNewest({ firstRun: false, distanceFromBottomPx: NEAR_BOTTOM_PX + 1 }),
    ).toBe(false);
    expect(shouldScrollToNewest({ firstRun: false, distanceFromBottomPx: 4000 })).toBe(false);
  });

  it('the near-bottom slack is about one bubble, not a screenful', () => {
    // Too generous and it yanks her mid-paragraph; too tight and following the
    // conversation stops working on a phone with an on-screen keyboard.
    expect(NEAR_BOTTOM_PX).toBeGreaterThanOrEqual(40);
    expect(NEAR_BOTTOM_PX).toBeLessThanOrEqual(200);
  });
});
