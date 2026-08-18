'use client';

import { useEffect } from 'react';

// Registra o service worker do app shell (ver public/sw.js) — sem isso um
// reload duro offline nunca chega a rodar nenhum JS pra sequer tentar ler o
// cache do TanStack Query ou a fila de vendas offline no IndexedDB.
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Só em produção: em `next dev` (Turbopack), URLs de chunk sob
    // `/_next/static/` não são hash-de-conteúdo estável entre restarts do
    // dev server (só em `next build` isso é garantido) — o cache-first do
    // sw.js pra esse prefixo então pode servir JS de uma versão antiga do
    // código sem nenhum erro visível no console, mascarando mudanças reais
    // durante o desenvolvimento. Achado ao vivo verificando este relatório.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sem service worker (navegador sem suporte, contexto não seguro
        // etc.) o app continua funcionando normalmente — só perde a
        // sobrevivência a reload duro offline, não é fatal.
      });
    }
  }, []);

  return null;
}
