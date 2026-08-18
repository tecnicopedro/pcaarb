'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useState } from 'react';
import { Toaster } from 'sonner';

// Chaves cujo cache sobrevive a um reload/aba nova — é o que deixa o PDV
// mostrar preço/estoque/caixa aberto na hora, mesmo offline, em vez de ficar
// preso esperando uma rede que não existe (ver painel/pdv/page.tsx). Lista
// fechada de propósito: não faz sentido guardar em localStorage o cache de
// telas que não precisam funcionar offline.
const PERSISTED_QUERY_KEY_PREFIXES = ['users', 'current-cash-session', 'products', 'customers', 'loyalty-program'];

// Muda só se a FORMA do que é persistido mudar (ex: um campo novo obrigatório
// que dado velho não tem) — invalida qualquer cache salvo por uma versão
// anterior deste código em vez de deixar o app tentar ler um formato errado.
const PERSIST_BUSTER = 'v1';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [persister] = useState(() =>
    typeof window === 'undefined'
      ? undefined
      : createSyncStoragePersister({ storage: window.localStorage, key: 'pcaarb-query-cache' }),
  );

  if (!persister) {
    // SSR/primeira renderização no servidor: sem localStorage, não tem o que
    // persistir — mesmo QueryClient, só sem o wrapper de persistência (que
    // exige um storage síncrono do browser pra existir).
    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: PERSIST_BUSTER,
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            PERSISTED_QUERY_KEY_PREFIXES.includes(String(query.queryKey[0])),
        },
      }}
    >
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </PersistQueryClientProvider>
  );
}
