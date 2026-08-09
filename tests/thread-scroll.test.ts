import { describe, it, expect } from 'vitest';
import {
  AT_BOTTOM_TOLERANCE_PX,
  distanceFromBottomPx,
  isAtBottom,
  shouldScrollToNewest,
  threadAnchorKey,
  type ScrollMetrics,
} from '@/lib/thread-scroll';
import { THREAD_WINDOW, windowThread } from '@/lib/thread-window';

/** WHAT THESE TESTS DO AND DO NOT COVER.
 *
 *  The pure half of the auto-scroll — what the effect keys on, what a scroll
 *  position means, and whether the anchor should fire — is here. The DOM half is
 *  not, and cannot be: there is no jsdom in this repo, and adding it would not
 *  help, because jsdom has no layout engine and reports scrollHeight,
 *  clientHeight and scrollTop as 0 for everything. A test of ThreadBottom's
 *  effect under jsdom would measure every scroller as sitting exactly at the
 *  bottom, take the "follow" branch every single time, and pass whether or not
 *  the component works. That is a test asserting nothing, so it is not written.
 *
 *  What IS testable is the arithmetic and the decision, once the metrics are
 *  arguments instead of live DOM reads — which is why distanceFromBottomPx and
 *  isAtBottom are functions here rather than an expression inside the effect. The
 *  bubble heights the burst tests feed them were measured in a real browser
 *  against this stylesheet; the numbers are in the commit message. */

/** Bubble advances MEASURED in Chrome at 375x812 against src/app/globals.css
 *  (.bubble: font-size 14px, line-height 1.4, padding 8px 11px, plus the
 *  .thread's 6px flex gap):
 *
 *    one line   35.59px outbound / 37.59px inbound (.in carries a 1px border)
 *               -> 41.59 / 43.59 with the gap
 *    two lines  55.19 / 57.19 -> 61.19 / 63.19 with the gap
 *
 *  The outbound figures are used here, so these are the SMALLEST realistic
 *  bursts. A real inbound burst clears the old 120px budget by more: three short
 *  inbound messages grew the document by exactly 131.0px in the browser.
 *
 *  These were measured when .bubble was 14px; the mobile pass raised it to 15px
 *  for readability. That only makes a real bubble TALLER than the numbers below,
 *  so they remain valid as lower bounds and the bursts they build remain the
 *  smallest realistic ones — which is the only property these tests rest on. They
 *  are deliberately NOT re-measured upward: a burst that is too small to trip the
 *  old decision would weaken the very tests that pin why measuring after the
 *  messages arrive is wrong. */
const ONE_LINE_BUBBLE_PX = 42;
const TWO_LINE_BUBBLE_PX = 62;

/** The constant today's code compared against, kept here so the burst tests can
 *  reproduce the old decision and show it going the wrong way. It is deliberately
 *  NOT imported: the point is that no value of it survives a large enough burst. */
const LEGACY_NEAR_BOTTOM_PX = 120;

/** She is exactly at the bottom of a thread that is four screens long. */
const atBottom: ScrollMetrics = { scrollHeight: 3248, scrollTop: 2436, clientHeight: 812 };

/** The same scroller after `grownByPx` of new bubbles were appended. Appending
 *  below the viewport moves neither scrollTop nor clientHeight — which is exactly
 *  why measuring after the fact reads as "she has scrolled away". */
function afterAppending(from: ScrollMetrics, grownByPx: number): ScrollMetrics {
  return { ...from, scrollHeight: from.scrollHeight + grownByPx };
}

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
    const rows = (newest: number) => [...Array(THREAD_WINDOW + 1)].map((_, i) => msg(String(newest - i)));

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

  it('does NOT change when older messages are loaded', () => {
    // The other half of the same property, and it is what makes MEDIUM 3 safe:
    // widening the window adds rows at the FRONT, so tapping "carregar mensagens
    // anteriores" leaves the key alone and the effect does not run. She is not
    // jumped to the bottom of the history she just asked to see.
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

describe('distanceFromBottomPx', () => {
  it('is zero at the bottom and a screenful at one screen up', () => {
    expect(distanceFromBottomPx(atBottom)).toBe(0);
    expect(distanceFromBottomPx({ ...atBottom, scrollTop: atBottom.scrollTop - 812 })).toBe(812);
  });

  it('is negative during rubber-band overscroll', () => {
    // iOS lets scrollTop run past the end while the finger is down. That is still
    // the bottom, and more so than the bottom is.
    expect(distanceFromBottomPx({ ...atBottom, scrollTop: atBottom.scrollTop + 80 })).toBe(-80);
  });
});

describe('isAtBottom', () => {
  it('is true at the bottom and through overscroll', () => {
    expect(isAtBottom(atBottom)).toBe(true);
    expect(isAtBottom({ ...atBottom, scrollTop: atBottom.scrollTop + 80 })).toBe(true);
  });

  it('absorbs sub-pixel rounding', () => {
    // scrollHeight and clientHeight are rounded integers while scrollTop is
    // fractional under browser zoom, so "at the bottom" rarely subtracts to
    // exactly 0. That residual is the only thing this tolerance is for.
    expect(isAtBottom({ ...atBottom, scrollTop: atBottom.scrollTop - 1 })).toBe(true);
    expect(isAtBottom({ ...atBottom, scrollTop: atBottom.scrollTop - AT_BOTTOM_TOLERANCE_PX })).toBe(
      true,
    );
  });

  it('is false once she has deliberately scrolled up, even by a single bubble', () => {
    // Measured when she last MOVED the scroll, so backing up one bubble to re-read
    // the previous message is an intent to be left alone — not slack to be spent.
    expect(
      isAtBottom({ ...atBottom, scrollTop: atBottom.scrollTop - ONE_LINE_BUBBLE_PX }),
    ).toBe(false);
    expect(isAtBottom({ ...atBottom, scrollTop: atBottom.scrollTop - 1500 })).toBe(false);
  });

  it('the tolerance is a rounding allowance, not a bubble budget', () => {
    // The constant it replaces was 120px, sized to swallow one newly-arrived
    // bubble because the measurement happened after arrival. Measuring before
    // arrival makes that budget both unnecessary and wrong, so the number has to
    // stay far below one bubble or it silently becomes a budget again.
    expect(AT_BOTTOM_TOLERANCE_PX).toBeGreaterThan(0);
    expect(AT_BOTTOM_TOLERANCE_PX).toBeLessThan(ONE_LINE_BUBBLE_PX / 2);
  });
});

describe('shouldScrollToNewest', () => {
  it('lands on the newest message when the thread opens', () => {
    // Otherwise every visit starts at the OLDEST message with the reply box below
    // the whole history — a page of thumb-scrolling before she can read what was
    // just asked.
    expect(shouldScrollToNewest({ firstRun: true, landOnOpen: true, wasAtBottom: false })).toBe(
      true,
    );
  });

  it('does NOT land on open when she is looking at a widened window', () => {
    // She tapped "carregar mensagens anteriores" to read the beginning. Throwing
    // her to the newest message would undo the only thing she asked for.
    expect(shouldScrollToNewest({ firstRun: true, landOnOpen: false, wasAtBottom: true })).toBe(
      false,
    );
  });

  it('follows a new message when she was at the bottom before it arrived', () => {
    expect(shouldScrollToNewest({ firstRun: false, landOnOpen: true, wasAtBottom: true })).toBe(
      true,
    );
  });

  it('leaves her alone when she is scrolled back through history', () => {
    // The poll ticks while the thread is open. Without this she would be yanked
    // out of whatever she was reading every time a message arrived.
    expect(shouldScrollToNewest({ firstRun: false, landOnOpen: true, wasAtBottom: false })).toBe(
      false,
    );
  });

  it('ignores landOnOpen after the first run', () => {
    // landOnOpen answers "where do we start", not "do we follow". A new message
    // arriving in an expanded window must still be followed if she is at the
    // bottom of it.
    expect(shouldScrollToNewest({ firstRun: false, landOnOpen: false, wasAtBottom: true })).toBe(
      true,
    );
    expect(shouldScrollToNewest({ firstRun: false, landOnOpen: false, wasAtBottom: false })).toBe(
      false,
    );
  });
});

describe('a burst arriving in a single tick', () => {
  /** THE BUG THIS FILE'S REWRITE EXISTS TO KILL.
   *
   *  The decision used to be taken from a distance measured AFTER the new bubbles
   *  were already in the DOM, against a 120px budget. Appending below the viewport
   *  does not move scrollTop, so every arriving bubble adds its own height to the
   *  measured distance — the reading is "how much arrived", wearing the costume of
   *  "how far she has scrolled away".
   *
   *  Three one-line bubbles clear 120px. So do two two-line ones. And once the
   *  budget is blown the anchor never fires again, so the distance only ever
   *  grows: silent, permanent, nothing on screen. threadPollMs now returns 60s for
   *  bot / awaiting_prayer / suspended / expanded threads, and a 60-second window
   *  holds a burst that a 15-second one rarely did. */

  it('follows three short messages that landed 126px below the fold', () => {
    const burst = afterAppending(atBottom, 3 * ONE_LINE_BUBBLE_PX);

    // The old measurement, reproduced. She had not moved a pixel, and it still
    // concluded she had walked away.
    expect(distanceFromBottomPx(burst)).toBe(126);
    expect(distanceFromBottomPx(burst) <= LEGACY_NEAR_BOTTOM_PX).toBe(false);

    // The question that actually matters is asked of the moment BEFORE.
    expect(
      shouldScrollToNewest({ firstRun: false, landOnOpen: true, wasAtBottom: isAtBottom(atBottom) }),
    ).toBe(true);
  });

  it('follows two two-line messages, which clear the old budget just as easily', () => {
    const burst = afterAppending(atBottom, 2 * TWO_LINE_BUBBLE_PX);

    expect(distanceFromBottomPx(burst)).toBe(124);
    expect(distanceFromBottomPx(burst) <= LEGACY_NEAR_BOTTOM_PX).toBe(false);

    expect(
      shouldScrollToNewest({ firstRun: false, landOnOpen: true, wasAtBottom: isAtBottom(atBottom) }),
    ).toBe(true);
  });

  it('gives the same answer whether one message arrived or six', () => {
    // The property no constant can buy: burst SIZE is not an input to the
    // decision. Raising 120 to 400 would only move the number of messages it
    // takes to break it, and the break would still be permanent.
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const burst = afterAppending(atBottom, count * TWO_LINE_BUBBLE_PX);
      expect(
        shouldScrollToNewest({
          firstRun: false,
          landOnOpen: true,
          wasAtBottom: isAtBottom(atBottom),
        }),
      ).toBe(true);
      // ...while the old reading walked steadily away from the budget and, past
      // two messages, never came back.
      expect(distanceFromBottomPx(burst)).toBe(count * TWO_LINE_BUBBLE_PX);
    }
  });

  it('does NOT drag her back when she had scrolled up before the burst', () => {
    // The other half of the property. A burst must not become a reason to follow
    // any more than it is a reason to stop.
    const readingHistory: ScrollMetrics = { ...atBottom, scrollTop: atBottom.scrollTop - 1500 };
    expect(isAtBottom(readingHistory)).toBe(false);

    for (const count of [1, 3, 6]) {
      afterAppending(readingHistory, count * ONE_LINE_BUBBLE_PX);
      expect(
        shouldScrollToNewest({
          firstRun: false,
          landOnOpen: true,
          wasAtBottom: isAtBottom(readingHistory),
        }),
      ).toBe(false);
    }
  });

  it('recovers on the next message once she scrolls back to the bottom', () => {
    // The failure mode being fixed was PERMANENT: every later message only
    // increased the measured distance, so nothing she could do short of reloading
    // brought auto-follow back. Reading her position at the scroll instead means
    // returning to the bottom restores it.
    const scrolledUp: ScrollMetrics = { ...atBottom, scrollTop: atBottom.scrollTop - 1500 };
    const grown = afterAppending(scrolledUp, 6 * ONE_LINE_BUBBLE_PX);
    expect(
      shouldScrollToNewest({ firstRun: false, landOnOpen: true, wasAtBottom: isAtBottom(grown) }),
    ).toBe(false);

    // She thumbs back down to the end of the taller thread.
    const backAtBottom: ScrollMetrics = { ...grown, scrollTop: grown.scrollHeight - grown.clientHeight };
    expect(
      shouldScrollToNewest({
        firstRun: false,
        landOnOpen: true,
        wasAtBottom: isAtBottom(backAtBottom),
      }),
    ).toBe(true);
  });
});
