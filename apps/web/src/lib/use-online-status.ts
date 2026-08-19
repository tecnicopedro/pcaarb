import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

/**
 * navigator.onLine only reflects whether the network interface is active, not
 * whether the API actually responds — but it's the signal available at zero
 * cost, and the fallback is the same either way: a real-time fetch failure
 * also queues the sale (see PdvPage). Used to drive the UI (badge, retry sync
 * on reconnect), not the only line of defense against losing a sale.
 */
export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
