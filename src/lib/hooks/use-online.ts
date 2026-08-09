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
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
