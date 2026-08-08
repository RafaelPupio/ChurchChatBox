'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { isAtBottom, shouldScrollToNewest, type ScrollMetrics } from '@/lib/thread-scroll';

/** useLayoutEffect is the whole point of this file (see below), but React logs a
 *  warning for it during server rendering, where no effect of either kind runs.
 *  On the server both are no-ops, so this is the same component with one less
 *  spurious line in the build output. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Whichever element actually scrolls: `.thread` once it has its own overflow,
 *  the page until then. Resolved per call, not cached, because the mobile plan
 *  gives `.thread` a max-height later and this has to pick that up. */
function resolveScroller(anchor: HTMLElement): HTMLElement | null {
  const thread = anchor.closest('.thread');
  return thread instanceof HTMLElement && thread.scrollHeight > thread.clientHeight + 1
    ? thread
    : null;
}

function readMetrics(scroller: HTMLElement | null): ScrollMetrics {
  if (scroller) {
    return {
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
      clientHeight: scroller.clientHeight,
    };
  }
  return {
    scrollHeight: document.documentElement.scrollHeight,
    scrollTop: window.scrollY,
    // innerHeight, not documentElement.clientHeight: on iOS Safari innerHeight
    // ignores the collapsing URL bar, so it does not shift under her while she
    // reads. clientHeight tracks the visual viewport and would report a different
    // "bottom" depending on the toolbar's state.
    clientHeight: window.innerHeight,
  };
}

/** An empty anchor at the end of the thread that puts the newest message on
 *  screen when the conversation opens, and follows later ones in if she is
 *  reading at the bottom.
 *
 *  Every visit used to start at the OLDEST message, with the reply box below the
 *  entire history — on a long thread that is a page of thumb-scrolling before she
 *  can read what was just asked, let alone answer it.
 *
 *  KEYED ON THE NEWEST MESSAGE'S ID, not on how many messages there are. The
 *  count stopped working the day the thread query was bounded — see
 *  src/lib/thread-scroll.ts, where the reasoning and the decision live and are
 *  tested.
 *
 *  WHERE THE POSITION IS MEASURED, WHICH IS THE BUG THIS VERSION FIXES. It used
 *  to be measured inside the update effect, i.e. after the new bubbles were
 *  already laid out. Appending below the fold moves neither scrollTop nor
 *  clientHeight, so the reading grew by exactly the height of what had arrived —
 *  "how much arrived" wearing the costume of "how far she has scrolled away".
 *  Three one-line bubbles or two two-line ones in a single tick cleared the 120px
 *  slack, auto-follow switched off although she had not moved, and it never came
 *  back on its own because every later message pushed the reading further out —
 *  measured at 130.5, 174.5, 217.5, 261.5, 304.5px over the following four
 *  messages. Silent, and permanent unless she happened to scroll to the bottom by
 *  hand, which nothing on screen would tell her to do. threadPollMs returns 60s
 *  for bot / awaiting_prayer / suspended / expanded threads, and a 60-second
 *  window holds bursts a 15-second one rarely did — bot-mode threads did not poll
 *  at all before, so this was new surface.
 *
 *  So the position is no longer measured on the update path at all. It is
 *  measured where the answer is actually knowable — when SHE moves the scroll —
 *  and remembered:
 *
 *    - a scroll listener records isAtBottom on every scroll, hers or ours;
 *    - a scroll that we performed sets it to true without measuring, because we
 *      know where we just put her;
 *    - an update reads the remembered answer and never re-measures.
 *
 *  Content arriving therefore cannot change the answer, whether one message
 *  arrives or six. And the failure is self-correcting rather than permanent:
 *  scrolling back to the bottom is a scroll event, so following resumes.
 *
 *  useLayoutEffect, not useEffect, and load-bearing. Scroll events are dispatched
 *  as part of the browser's rendering lifecycle, never inside a React commit; a
 *  layout effect runs in the same synchronous task as the DOM mutation that
 *  triggered it. So nothing can slip a POST-mutation scroll reading into the ref
 *  between the bubbles landing and this reading it. A passive useEffect is flushed
 *  after paint, leaving exactly that window open — and paints the un-scrolled
 *  frame first as well.
 *
 *  The one gap left, stated rather than hidden: a scroll event is delivered on the
 *  next frame, so a commit landing in the sub-frame gap after she scrolls reads a
 *  ref that is one scroll stale. That is a ~16ms window against a poll that ticks
 *  every 15 to 60 SECONDS, and it costs at most one wrong decision — the scroll
 *  event lands immediately after and the next message is right. Compare the shape
 *  of what it replaces: deterministic on every three-message burst, and permanent.
 *  (This is also why the harness numbers had to be taken with the browser pane in
 *  front. A hidden tab suspends the rendering lifecycle, so scroll events are
 *  never dispatched at all and a scrolled-up reader looks like one at the bottom.)
 *
 *  jsdom cannot reach any of this: it has no layout engine and reports
 *  scrollHeight, clientHeight and scrollTop as 0 for everything, so every
 *  scroller measures as sitting exactly at the bottom and a test of this effect
 *  would pass whether or not the component works. The arithmetic and the decision
 *  are pure and unit-tested in tests/thread-scroll.test.ts; the DOM half was
 *  measured in a real browser and the numbers are in the commit message.
 *
 *  `landOnOpen` is false while she is reading a widened window. Loading older
 *  messages does not change the newest message's id, so on a preserved component
 *  instance this effect does not re-run at all and she simply stays put — but a
 *  remount would reset `firstRun` and throw her to the bottom of history she just
 *  asked to see. This makes the outcome the same either way rather than resting
 *  on which one React does. */
export function ThreadBottom({
  newestId,
  landOnOpen,
}: {
  newestId: string | null;
  landOnOpen: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

  /** Was she at the bottom the last time the scroll position meant anything?
   *  Seeded by the first run below, never by an arriving message. */
  const wasAtBottom = useRef(true);

  useEffect(() => {
    const node = anchor.current;
    if (!node) return;

    // Synchronous, NOT throttled through requestAnimationFrame. The usual reason
    // to throttle a scroll handler is to avoid forcing layout, and this one does
    // not: during scroll dispatch the layout is already clean, so these are cheap
    // reads. Deferring them to the next frame would be actively wrong — the frame
    // it lands in could be one that has already appended new bubbles, which puts
    // the measurement back after the content and restores the bug.
    const sync = () => {
      wasAtBottom.current = isAtBottom(readMetrics(resolveScroller(node)));
    };

    // Capture phase on window catches BOTH scrollers: a scroll on `.thread` does
    // not bubble, but it does run capture listeners on its ancestors, and the
    // page's own scroll targets document. One listener either way, so this keeps
    // working when the mobile plan turns `.thread` into the scroller.
    window.addEventListener('scroll', sync, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', sync, { capture: true });

    // Deliberately NOT listening for resize. An on-screen keyboard opening
    // shortens the viewport and pushes the bottom away without her having moved,
    // and re-measuring there would read that as "she left" — the same class of
    // mistake as measuring after the messages arrive.
  }, []);

  useIsomorphicLayoutEffect(() => {
    const node = anchor.current;
    if (!node) return;

    const scroller = resolveScroller(node);

    if (
      shouldScrollToNewest({
        firstRun: firstRun.current,
        landOnOpen,
        wasAtBottom: wasAtBottom.current,
      })
    ) {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      else window.scrollTo(0, document.documentElement.scrollHeight);
      // We just put her at the bottom; asserting it beats re-measuring a layout
      // we have only this instant invalidated.
      wasAtBottom.current = true;
    } else if (firstRun.current) {
      // The one honest measurement on this path: opening a widened window does
      // not scroll, so wherever the browser left her IS the answer until she
      // scrolls. Later runs must not re-measure — see the comment above.
      wasAtBottom.current = isAtBottom(readMetrics(scroller));
    }

    firstRun.current = false;
    // `landOnOpen` is deliberately NOT a dependency: it only ever decides the
    // first run, and re-running this effect when it flips would be the yank it
    // exists to prevent.
  }, [newestId]);

  return <div ref={anchor} aria-hidden="true" />;
}
