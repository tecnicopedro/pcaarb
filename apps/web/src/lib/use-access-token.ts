import { useSyncExternalStore } from 'react';

const ACCESS_TOKEN_KEY = 'pcaarb_access_token';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getServerSnapshot() {
  // undefined ("don't know yet"), never null ("confirmed there's no token").
  // The real getSnapshot() only returns string | null — undefined is a third
  // state exclusive to this first hydration render, which exists just so
  // whoever reads the value can distinguish "haven't confirmed yet" from
  // "confirmed logged out". Without this distinction, an effect that reacts
  // to "accessToken === null" to redirect to /login would fire on this
  // first render (which always uses this server snapshot, even on the
  // client, just to match the HTML coming from SSR) — BEFORE
  // useSyncExternalStore corrects it to the real localStorage value, kicking
  // out a user who is actually logged in, on every reload/new tab.
  return undefined;
}

/**
 * Reads the access token via useSyncExternalStore instead of useState+useEffect:
 * avoids setState inside an effect and keeps the server snapshot
 * (undefined) consistent with the first render on the client, without
 * a hydration mismatch.
 */
export function useAccessToken() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
