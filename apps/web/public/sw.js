// Service worker do app shell — deixa a página do PDV abrir de novo (reload
// duro, aba nova, celular reiniciado) mesmo totalmente offline, contanto que
// o operador já tenha carregado a página pelo menos uma vez online antes.
//
// Deliberadamente SEM lista de precache com hashes de build (o approach do
// next-pwa/Workbox precache manifest): nomes de arquivo do Next.js mudam a
// cada deploy, e uma lista de precache fixa vira lixo obsoleto que aponta pra
// URLs que não existem mais no próximo deploy — exatamente o "footgun" de
// versionamento identificado no design da fatia 1 (ver memória
// pcaarb_mobile_pdv_decision). Em vez disso, cache só-em-runtime: cada
// resposta cacheada é o que o navegador realmente buscou rodando a versão
// atual do app, então nunca fica presa numa lista desatualizada — e como o
// documento HTML é sempre buscado network-first, o cache se autoatualiza
// sozinho a cada visita online, sem precisar bumpar versão a cada deploy.
const CACHE_NAME = 'pcaarb-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só GET: uma mutação (POST/PATCH/DELETE — venda, pagamento, estoque...)
  // nunca pode ser interceptada aqui. Deixa passar direto pro navegador tratar
  // normalmente, sem nenhum envolvimento do cache.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Só mesma origem: chamadas pra API (outra origem/porta) não passam por
  // aqui — quem cuida de deixar dado de API disponível offline é o cache
  // persistido do TanStack Query (ver providers.tsx), não o service worker.
  // Evita dois caches independentes da mesma coisa podendo divergir.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Assets estáticos do Next (_next/static/...) têm hash de conteúdo no nome
  // — uma URL com hash nunca muda de conteúdo, então cache-first é seguro e
  // rápido, sem risco de servir algo desatualizado.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Navegação / documento da página: network-first. Online, o operador
  // sempre recebe o HTML mais recente (nunca serve algo obsoleto por engano)
  // e o cache é atualizado com essa resposta. Só cai pro cache quando o
  // fetch falha de verdade (offline) — é isso que permite abrir a página de
  // novo depois de um reload duro sem internet.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error('offline e sem versão em cache desta página');
      }
    })(),
  );
});
