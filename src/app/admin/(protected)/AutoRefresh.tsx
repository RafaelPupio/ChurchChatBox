'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Keeps an open server-rendered screen current.
 *
 *  Nothing pushes an inbound WhatsApp message into an open panel: the webhook
 *  writes the row on the server, and `revalidatePath` only ever fires inside the
 *  admin's OWN actions. Without this, a member's reply is invisible until the
 *  secretary reloads by hand — which turns a conversation into a page-refresh
 *  loop, on a phone, while someone waits for an answer.
 *
 *  `router.refresh()` re-runs the Server Component and patches the result into the
 *  existing tree: client components are not unmounted, so a half-typed reply and
 *  the scroll position both survive a refresh that lands mid-sentence.
 *
 *  Polling PAUSES while the tab is hidden. Every tick is a real query against
 *  Neon, billed by compute time, and a phone left in a pocket with the panel open
 *  would otherwise poll all afternoon for a screen nobody is looking at. Coming
 *  back to the tab refreshes once immediately, so the pause is invisible. */
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const start = () => {
      if (timer === undefined) timer = setInterval(() => router.refresh(), intervalMs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Catch up on whatever arrived while the tab was in the background,
        // before waiting out another full interval.
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Both the timer and the listener are torn down on unmount — navigating away
    // from the thread must stop the queries, not leave a timer running behind a
    // screen that no longer exists.
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [router, intervalMs]);

  return null;
}
