'use client';

import { useEffect } from 'react';

// Registers the app shell's service worker (see public/sw.js) — without this,
// a hard offline reload never even gets to run any JS to try reading the
// TanStack Query cache or the offline sale queue in IndexedDB.
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Production only: in `next dev` (Turbopack), chunk URLs under
    // `/_next/static/` aren't stable content-hashed across dev server
    // restarts (that's only guaranteed by `next build`) — sw.js's
    // cache-first strategy for that prefix could then serve JS from an old
    // version of the code with no visible error in the console, masking real
    // changes during development. Found live while checking this behavior.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Without a service worker (unsupported browser, insecure context,
        // etc.) the app keeps working normally — it just loses survival
        // across a hard offline reload, not fatal.
      });
    }
  }, []);

  return null;
}
