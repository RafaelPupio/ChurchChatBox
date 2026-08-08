'use client';

import { useEffect, useState, useTransition } from 'react';
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
 *  WHAT A TICK ACTUALLY COSTS. The commit that introduced this said "4 a minute",
 *  which is the tick rate, not the price — and the two were quietly read as the
 *  same thing. A refresh refetches the whole route tree, so each tick re-runs the
 *  layout AND the page: getChurchById, findAdminById, and loadConversation's two
 *  queries. That is ~4 queries per tick and ~16 a minute per open thread at the
 *  default 15s, four times the figure the commit message implies, plus the
 *  serialised thread itself over her mobile data. Which is why the thread query
 *  is now bounded (src/lib/thread-window.ts), and why the church read is memoised
 *  per request so the layout and the page share one query.
 *
 *  `intervalMs` is how the caller buys that cost down WITHOUT switching the poll
 *  off. An earlier attempt did switch it off for threads judged not worth
 *  watching, and the judgement was wrong in the most expensive possible way — see
 *  src/lib/thread-poll.ts. A screen that has silently stopped updating cannot be
 *  told apart from a quiet conversation, so the answer is a slower tick, never no
 *  tick.
 *
 *  Polling PAUSES while the tab is hidden. Every tick is a real query against
 *  Neon, billed by compute time, and a phone left in a pocket with the panel open
 *  would otherwise poll all afternoon for a screen nobody is looking at. Coming
 *  back to the tab refreshes once immediately, so the pause is invisible. */
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const sync = () => {
      const nowVisible = document.visibilityState === 'visible';
      setVisible(nowVisible);
      // Catch up on whatever arrived while the tab was in the background, before
      // waiting out another full interval. This doubles as the recovery path if a
      // refresh ever fails to settle: coming back to the tab always re-arms.
      if (nowVisible) startRefresh(() => router.refresh());
    };
    setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [router]);

  /** A self-scheduling timeout, NOT setInterval.
   *
   *  setInterval fires on a fixed wall-clock schedule and does not care whether
   *  the previous refresh came back. On a cold Neon compute a tick can take
   *  several seconds, and the fixed schedule keeps stacking new ones behind it —
   *  the slower the database, the harder this hammers it. Here the next timeout is
   *  armed only from a state in which nothing is in flight, so the gap between
   *  refreshes is always at least intervalMs of actual idle.
   *
   *  `refreshing` comes from useTransition wrapping router.refresh(), which stays
   *  pending until the new RSC payload has landed. If a future Next release stops
   *  propagating that, this degrades to a plain self-scheduling timeout — still
   *  strictly better than a fixed interval, and never worse. */
  useEffect(() => {
    if (!visible || refreshing) return;
    const timer = setTimeout(() => startRefresh(() => router.refresh()), intervalMs);
    return () => clearTimeout(timer);
  }, [visible, refreshing, router, intervalMs]);

  return null;
}
