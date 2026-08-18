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
  // undefined ("ainda não sei"), nunca null ("confirmei que não tem token").
  // getSnapshot() real só retorna string | null — undefined é um terceiro
  // estado exclusivo desta primeira renderização de hidratação, que existe
  // só pra quem lê o valor conseguir distinguir "ainda não confirmei" de
  // "confirmei que está deslogado". Sem essa distinção, um efeito que reage
  // a "accessToken === null" pra redirecionar pro /login dispara nessa
  // primeira renderização (que sempre usa este snapshot do servidor, mesmo
  // no cliente, só pra bater com o HTML vindo do SSR) — ANTES do
  // useSyncExternalStore corrigir pro valor real do localStorage, chutando
  // pra fora um usuário que na verdade está logado, em todo reload/aba nova.
  return undefined;
}

/**
 * Lê o access token via useSyncExternalStore em vez de useState+useEffect:
 * evita setState dentro de effect e mantém o snapshot do servidor
 * (undefined) consistente com a primeira renderização no cliente, sem
 * mismatch de hidratação.
 */
export function useAccessToken() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
