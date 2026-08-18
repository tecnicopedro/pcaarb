import type { CreateSaleInput } from '@pcaarb/shared';

const DB_NAME = 'pcaarb-offline-sales';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

export interface QueuedSale {
  clientSaleId: string;
  // Escopado por tenant: o mesmo navegador/dispositivo pode logar em lojas
  // diferentes (computador compartilhado) — nunca sincroniza a fila de um
  // tenant usando o token de outro.
  tenantId: string;
  payload: CreateSaleInput;
  queuedAt: string;
  // 'pending': ainda não conseguiu sincronizar (rede fora), tenta de novo
  // sozinho na próxima reconexão. 'needs_attention': o servidor respondeu e
  // rejeitou a venda (estoque insuficiente, produto desativado etc.) — para
  // de tentar sozinho, fica visível até o operador decidir o que fazer.
  // Nunca alterna sozinho de volta pra 'pending' nem some sem essa decisão.
  status: 'pending' | 'needs_attention';
  lastError: string | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'clientSaleId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineSale(item: QueuedSale): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listOfflineSales(tenantId: string): Promise<QueuedSale[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const all = request.result as QueuedSale[];
      resolve(all.filter((item) => item.tenantId === tenantId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function removeOfflineSale(clientSaleId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(clientSaleId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function markOfflineSaleNeedsAttention(clientSaleId: string, lastError: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(clientSaleId);
    getRequest.onsuccess = () => {
      const existing = getRequest.result as QueuedSale | undefined;
      if (existing) {
        store.put({ ...existing, status: 'needs_attention', lastError });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
