'use client';

import { useEffect, useRef } from 'react';
import { shouldScrollToNewest } from '@/lib/thread-scroll';

/** An empty anchor at the end of the thread that puts the newest message on
 *  screen when the conversation opens.
 *
 *  Every visit used to start at the OLDEST message, with the reply box below the
 *  entire history — on a long thread that is a page of thumb-scrolling before she
 *  can read what was just asked, let alone answer it.
 *
 *  `.thread` grows with the page today, so the page is what has to move; the
 *  mobile plan later gives `.thread` its own `max-height` and `overflow-y`, and
 *  this picks up that change automatically by scrolling whichever of the two is
 *  actually the scroll container.
 *
 *  KEYED ON THE NEWEST MESSAGE'S ID, not on how many messages there are. The
 *  count stopped working the day the thread query was bounded — see
 *  src/lib/thread-scroll.ts, where the reasoning and the decision live and are
 *  tested. All that is left here is the DOM, which no unit test in this repo can
 *  reach: jsdom has no layout engine, so `scrollHeight`, `clientHeight` and
 *  `scrollTop` are all zero under it and any test of this effect would assert
 *  nothing. It was measured in a real browser instead.
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

  useEffect(() => {
    const node = anchor.current;
    if (!node) return;

    const thread = node.closest('.thread');
    const scroller =
      thread instanceof HTMLElement && thread.scrollHeight > thread.clientHeight + 1 ? thread : null;

    const distanceFromBottomPx = scroller
      ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      : document.documentElement.scrollHeight - window.scrollY - window.innerHeight;

    if (shouldScrollToNewest({ firstRun: firstRun.current, landOnOpen, distanceFromBottomPx })) {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      else window.scrollTo(0, document.documentElement.scrollHeight);
    }
    firstRun.current = false;
    // `landOnOpen` is deliberately NOT a dependency: it only ever decides the
    // first run, and re-running this effect when it flips would be the yank it
    // exists to prevent.
  }, [newestId]);

  return <div ref={anchor} aria-hidden="true" />;
}
