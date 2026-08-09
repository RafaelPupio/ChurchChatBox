'use client';

import { useEffect } from 'react';

/** Registered in production only. In development a service worker serving a
 *  cached shell is a reliable way to spend an hour debugging a change that did
 *  ship — and the offline fallback has no value on localhost anyway.
 *
 *  Failure is swallowed on purpose: the offline page is a courtesy, and a browser
 *  that refuses to register one must not break the panel. */
export function RegisterServiceWorker(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}
