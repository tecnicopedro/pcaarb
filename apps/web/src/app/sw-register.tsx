'use client';

import { useEffect } from 'react';

// Registra o service worker do app shell (ver public/sw.js) — sem isso um
// reload duro offline nunca chega a rodar nenhum JS pra sequer tentar ler o
// cache do TanStack Query ou a fila de vendas offline no IndexedDB.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sem service worker (navegador sem suporte, contexto não seguro
        // etc.) o app continua funcionando normalmente — só perde a
        // sobrevivência a reload duro offline, não é fatal.
      });
    }
  }, []);

  return null;
}
