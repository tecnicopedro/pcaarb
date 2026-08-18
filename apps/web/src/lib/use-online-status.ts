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
 * navigator.onLine só reflete se a interface de rede está ativa, não se a
 * API realmente responde — mas é o sinal disponível sem custo, e o fallback
 * de qualquer forma é o mesmo: uma falha de fetch em tempo real também
 * enfileira a venda (ver PdvPage). Serve pra decidir a UI (badge, tentar
 * sincronizar ao reconectar), não é a única linha de defesa contra perda de venda.
 */
export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
