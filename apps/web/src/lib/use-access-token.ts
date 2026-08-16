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
  return null;
}

/**
 * Lê o access token via useSyncExternalStore em vez de useState+useEffect:
 * evita setState dentro de effect e mantém o snapshot do servidor (null)
 * consistente com a primeira renderização no cliente, sem mismatch de hidratação.
 */
export function useAccessToken() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
