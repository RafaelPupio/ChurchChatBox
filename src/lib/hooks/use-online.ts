'use client';

import { useEffect, useState } from 'react';

/** navigator.onLine only proves the device has *a* network, not that Neon is
 *  reachable — but "no signal at all" is the case that actually happens in a
 *  church building with thick walls, and it is the one worth naming for her.
 *
 *  Starts optimistic so the server-rendered HTML and the first client render
 *  agree (no hydration mismatch); the real value arrives on the first effect. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // `visibilitychange` and `focus` re-read the real value instead of waiting
    // for an event that may never come. An `offline` can fire without its
    // matching `online` — an Android Wi-Fi-to-LTE handover, a VPN reconnect —
    // and nothing else re-reads it, because router.refresh() patches this
    // component in place and never remounts it. The screen would then sit
    // "offline" indefinitely while the poll kept fetching new messages
    // successfully: a member's replies arriving on a page she believes has no
    // signal. AutoRefresh already refuses to trust these events for the same
    // reason. Cheap, and it makes the stuck state self-correct on the next tap.
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  return online;
}
