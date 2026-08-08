'use client';

import { useEffect, useRef } from 'react';

/** How close to the bottom still counts as "she is following the conversation".
 *  Measured after the new message is already in the DOM, so the slack has to be
 *  roughly one bubble tall. */
const NEAR_BOTTOM_PX = 120;

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
 *  Re-runs when the message count changes, so a message brought in by AutoRefresh
 *  is landed on too — but only if she is already at the bottom. Yanking her away
 *  from history she is deliberately reading, every 15 seconds, would be its own
 *  bug. */
export function ThreadBottom({ count }: { count: number }) {
  const anchor = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    const node = anchor.current;
    if (!node) return;

    const thread = node.closest('.thread');
    const scroller =
      thread instanceof HTMLElement && thread.scrollHeight > thread.clientHeight + 1 ? thread : null;

    const distanceFromBottom = scroller
      ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      : document.documentElement.scrollHeight - window.scrollY - window.innerHeight;

    if (firstRun.current || distanceFromBottom <= NEAR_BOTTOM_PX) {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      else window.scrollTo(0, document.documentElement.scrollHeight);
    }
    firstRun.current = false;
  }, [count]);

  return <div ref={anchor} aria-hidden="true" />;
}
