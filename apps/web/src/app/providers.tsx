'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useState } from 'react';
import { Toaster } from 'sonner';

// Keys whose cache survives a reload/new tab — this is what lets the PDV
// show price/stock/open cash session instantly, even offline, instead of
// getting stuck waiting for a network that doesn't exist (see painel/pdv/page.tsx).
// Deliberately closed list: it doesn't make sense to store in localStorage the
// cache of screens that don't need to work offline.
const PERSISTED_QUERY_KEY_PREFIXES = ['users', 'current-cash-session', 'products', 'customers', 'loyalty-program'];

// Changes only if the SHAPE of what's persisted changes (e.g. a new required
// field that old data doesn't have) — invalidates any cache saved by a
// previous version of this code instead of letting the app try to read a wrong format.
const PERSIST_BUSTER = 'v1';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [persister] = useState(() =>
    typeof window === 'undefined'
      ? undefined
      : createSyncStoragePersister({ storage: window.localStorage, key: 'pcaarb-query-cache' }),
  );

  if (!persister) {
    // SSR/first render on the server: no localStorage, nothing to persist —
    // same QueryClient, just without the persistence wrapper (which requires
    // a synchronous browser storage to exist).
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
