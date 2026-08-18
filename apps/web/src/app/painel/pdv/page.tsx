'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CloudOff, Gift, Plus, Receipt, ShoppingCart, Trash2, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { CashSession, CreateSaleInput, Customer, CustomerLoyaltyBalance, LoyaltyProgram, PaymentMethod, Product, Sale, Store } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL, parseBRLToCents } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { useOnlineStatus } from '@/lib/use-online-status';
import {
  enqueueOfflineSale,
  listOfflineSales,
  markOfflineSaleNeedsAttention,
  removeOfflineSale,
  type QueuedSale,
} from '@/lib/offline-sale-queue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

interface CartLine {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
}

interface PaymentLine {
  method: PaymentMethod;
  amountReais: string;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
};

function formatSaleQueueTotal(sale: QueuedSale): string {
  const totalCents = sale.payload.payments.reduce((sum, p) => sum + p.amountCents, 0);
  return formatCentsToBRL(totalCents);
}

async function fetchCurrentSession(accessToken: string): Promise<CashSession | null> {
  try {
    return await apiFetch<CashSession>('/cash-sessions/current', { accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export default function PdvPage() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const meQuery = useCurrentUser();
  const tenantId = meQuery.data?.tenant.id;
  const isOnline = useOnlineStatus();

  const offlineQueueQuery = useQuery({
    queryKey: ['offline-sale-queue', tenantId],
    queryFn: () => listOfflineSales(tenantId!),
    enabled: !!tenantId,
    // A fila só muda por ação local (venda enfileirada, sync tentado) — não
    // por nada que aconteça no servidor, então não faz sentido revalidar
    // sozinha; invalidateQueries dispara a releitura nos momentos certos.
    staleTime: Infinity,
    // 'always': o padrão do react-query ('online') pausa a query inteira
    // enquanto o navegador está offline — errado aqui, já que isto lê do
    // IndexedDB local, não da rede, e é exatamente o que precisa continuar
    // funcionando offline.
    networkMode: 'always',
  });
  const pendingSales = offlineQueueQuery.data?.filter((s) => s.status === 'pending') ?? [];
  const attentionSales = offlineQueueQuery.data?.filter((s) => s.status === 'needs_attention') ?? [];

  // Sincroniza a fila local: reenvia cada venda pendente com a mesma
  // clientSaleId (idempotente — ver SalesService.create). Recusa de verdade
  // do servidor (estoque insuficiente, produto desativado, caixa que
  // originou a venda não existe mais) vira 'needs_attention' e para de
  // tentar sozinha; falha de rede (ainda offline) deixa como está pra
  // tentar de novo na próxima reconexão — nunca descarta nem finge sucesso.
  const flushOfflineQueue = useCallback(async () => {
    if (!accessToken || !tenantId) return;
    const queued = await listOfflineSales(tenantId);
    const toSync = queued.filter((item) => item.status === 'pending');
    if (toSync.length === 0) return;

    let syncedCount = 0;
    let attentionCount = 0;
    for (const item of toSync) {
      try {
        await apiFetch<Sale>('/sales', { method: 'POST', accessToken, body: item.payload });
        await removeOfflineSale(item.clientSaleId);
        syncedCount += 1;
      } catch (error) {
        if (error instanceof ApiError) {
          await markOfflineSaleNeedsAttention(item.clientSaleId, error.message);
          attentionCount += 1;
        }
        // erro de rede (ainda sem conexão de verdade): deixa 'pending', tenta de novo depois
      }
    }

    if (syncedCount > 0) {
      toast.success(`${syncedCount} venda(s) offline sincronizada(s)`);
    }
    if (attentionCount > 0) {
      toast.error(`${attentionCount} venda(s) offline não puderam ser sincronizadas — veja os detalhes na tela`);
    }
    if (syncedCount > 0 || attentionCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['offline-sale-queue'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['current-cash-session'] });
    }
  }, [accessToken, tenantId, queryClient]);

  // Tenta sincronizar ao reconectar, e uma vez ao carregar a página (cobre o
  // caso de vendas enfileiradas numa aba/sessão anterior enquanto o
  // dispositivo já está online de novo).
  useEffect(() => {
    if (isOnline) {
      flushOfflineQueue();
    }
  }, [isOnline, flushOfflineQueue]);

  async function discardAttentionSale(clientSaleId: string) {
    await removeOfflineSale(clientSaleId);
    queryClient.invalidateQueries({ queryKey: ['offline-sale-queue'] });
    toast.success('Venda pendente descartada');
  }

  const sessionQuery = useQuery({
    queryKey: ['current-cash-session'],
    queryFn: () => fetchCurrentSession(accessToken!),
    enabled: !!accessToken,
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => apiFetch<Product[]>('/products', { accessToken: accessToken! }),
    enabled: !!accessToken && !!sessionQuery.data,
  });

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<Customer[]>('/customers', { accessToken: accessToken! }),
    enabled: !!accessToken && !!sessionQuery.data,
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [pointsToRedeemInput, setPointsToRedeemInput] = useState('');

  const loyaltyProgramQuery = useQuery({
    queryKey: ['loyalty-program'],
    queryFn: () => apiFetch<LoyaltyProgram>('/loyalty/program', { accessToken: accessToken! }),
    enabled: !!accessToken && !!sessionQuery.data,
  });

  const customerBalanceQuery = useQuery({
    queryKey: ['loyalty-balance', selectedCustomerId],
    queryFn: () =>
      apiFetch<CustomerLoyaltyBalance>(`/customers/${selectedCustomerId}/loyalty/balance`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedCustomerId,
  });

  const storesQuery = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiFetch<Store[]>('/stores', { accessToken: accessToken! }),
    enabled: !!accessToken && !sessionQuery.data,
  });
  const activeStores = storesQuery.data?.filter((store) => store.active) ?? [];

  const [openingAmount, setOpeningAmount] = useState('');
  // A maioria dos tenants tem 1 loja só (plano Starter/Profissional) — nesse
  // caso nem mostra seletor, já usa a única loja direto.
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const effectiveStoreId = selectedStoreId || (activeStores.length === 1 ? activeStores[0]!.id : '');

  const openSessionMutation = useMutation({
    mutationFn: () =>
      apiFetch<CashSession>('/cash-sessions', {
        method: 'POST',
        accessToken: accessToken!,
        body: { storeId: effectiveStoreId, openingAmountCents: parseBRLToCents(openingAmount || '0') },
      }),
    onSuccess: () => {
      setOpeningAmount('');
      queryClient.invalidateQueries({ queryKey: ['current-cash-session'] });
      toast.success('Caixa aberto');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao abrir o caixa');
    },
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [discountReais, setDiscountReais] = useState('');
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  const subtotalCents = useMemo(
    () => cart.reduce((sum, line) => sum + line.priceCents * line.quantity, 0),
    [cart],
  );
  const discountCents = parseBRLToCents(discountReais || '0');
  const pointsToRedeem = Math.max(Number.parseInt(pointsToRedeemInput, 10) || 0, 0);
  const redemptionValueCents = pointsToRedeem * (loyaltyProgramQuery.data?.redeemValueCents ?? 0);
  const totalCents = Math.max(subtotalCents - discountCents - redemptionValueCents, 0);
  const paidCents = useMemo(
    () => payments.reduce((sum, p) => sum + parseBRLToCents(p.amountReais || '0'), 0),
    [payments],
  );
  const remainingCents = totalCents - paidCents;

  function addToCart() {
    const product = productsQuery.data?.find((p) => p.id === selectedProductId);
    if (!product) return;
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...prev, { productId: product.id, name: product.name, priceCents: product.priceCents, quantity: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((line) => line.productId !== productId));
  }

  function addPaymentLine() {
    setPayments((prev) => [...prev, { method: 'dinheiro', amountReais: '' }]);
  }

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  type CreateSaleOutcome = { kind: 'synced'; sale: Sale } | { kind: 'queued' };

  const createSaleMutation = useMutation<CreateSaleOutcome, Error, void>({
    // 'always': o padrão do react-query ('online') PAUSA a mutation inteira
    // enquanto o navegador está offline — nunca chega a chamar mutationFn,
    // só retoma quando a conexão volta. Isso anularia completamente o
    // enfileiramento local (o objetivo inteiro desta mutation): o botão
    // ficaria girando pra sempre até reconectar, em vez de salvar a venda no
    // dispositivo na hora. mutationFn já trata a conectividade sozinho
    // (checagem de isOnline + catch de falha de rede), então não precisa —
    // e não pode — depender do controle de rede do react-query aqui.
    networkMode: 'always',
    mutationFn: async (): Promise<CreateSaleOutcome> => {
      // clientSaleId nasce AQUI, já dentro do corpo que vai pro servidor —
      // é a mesma chave usada como id da fila local (offline-sale-queue) e a
      // mandada num eventual retry de sincronização, garantindo que o
      // servidor veja sempre a mesma clientSaleId pra esta venda em
      // qualquer tentativa (ver SalesService.create — idempotência real
      // depende da chave ser idêntica em toda tentativa, não só existir).
      const clientSaleId = crypto.randomUUID();
      const body: CreateSaleInput = {
        customerId: selectedCustomerId || undefined,
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        discountCents,
        pointsToRedeem,
        payments: payments.map((p) => ({ method: p.method, amountCents: parseBRLToCents(p.amountReais || '0') })),
        clientSaleId,
      };

      // Sem conexão de verdade: nem tenta a requisição, enfileira direto —
      // evita esperar o timeout do fetch pra descobrir o óbvio.
      if (!isOnline) {
        await enqueueOfflineSale({
          clientSaleId,
          tenantId: tenantId!,
          payload: body,
          queuedAt: new Date().toISOString(),
          status: 'pending',
          lastError: null,
        });
        return { kind: 'queued' };
      }

      try {
        const sale = await apiFetch<Sale>('/sales', { method: 'POST', accessToken: accessToken!, body });
        return { kind: 'synced', sale };
      } catch (error) {
        // ApiError = o servidor respondeu e recusou a venda de verdade
        // (estoque insuficiente, pagamento não fecha etc.) — não é um
        // problema de conectividade, tem que aparecer pro operador agora,
        // não ficar escondido numa fila.
        if (error instanceof ApiError) {
          throw error;
        }
        // Qualquer outro erro aqui é o fetch falhando por rede (a conexão
        // caiu bem na hora de finalizar) — a venda já foi conferida no
        // cliente (carrinho, pagamento fechado), então vira uma venda
        // enfileirada com a MESMA clientSaleId que seria usada num retry
        // manual, em vez de o operador simplesmente perder a venda.
        await enqueueOfflineSale({
          clientSaleId,
          tenantId: tenantId!,
          payload: body,
          queuedAt: new Date().toISOString(),
          status: 'pending',
          lastError: null,
        });
        return { kind: 'queued' };
      }
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'synced') {
        setLastSale(outcome.sale);
        queryClient.invalidateQueries({ queryKey: ['loyalty-balance', selectedCustomerId] });
      } else {
        toast.success('Sem conexão — venda salva no dispositivo. Será enviada automaticamente quando a internet voltar.');
        queryClient.invalidateQueries({ queryKey: ['offline-sale-queue'] });
      }
      setCart([]);
      setPayments([]);
      setDiscountReais('');
      setPointsToRedeemInput('');
      setSaleError(null);
    },
    onError: (error) => {
      setSaleError(error instanceof ApiError ? error.message : 'Erro inesperado ao registrar a venda');
    },
  });

  const [closingAmount, setClosingAmount] = useState('');
  const closeSessionMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/cash-sessions/${sessionQuery.data!.id}/close`, {
        method: 'POST',
        accessToken: accessToken!,
        body: { closingAmountCents: parseBRLToCents(closingAmount || '0') },
      }),
    onSuccess: () => {
      setClosingAmount('');
      queryClient.invalidateQueries({ queryKey: ['current-cash-session'] });
      toast.success('Caixa fechado');
    },
  });

  const [movementType, setMovementType] = useState<'sangria' | 'suprimento'>('sangria');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const addMovementMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/cash-sessions/${sessionQuery.data!.id}/movements`, {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          type: movementType,
          amountCents: parseBRLToCents(movementAmount || '0'),
          reason: movementReason || undefined,
        },
      }),
    onSuccess: () => {
      setMovementAmount('');
      setMovementReason('');
      toast.success(movementType === 'sangria' ? 'Sangria registrada' : 'Suprimento registrado');
    },
  });

  if (!accessToken || sessionQuery.isLoading) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">PDV</h1>

      {!sessionQuery.data ? (
        <Card className="flex flex-col gap-4">
          <h2 className="font-medium">Abrir caixa</h2>
          <p className="text-sm text-muted">Informe o valor em dinheiro que está começando no caixa.</p>
          <div className="flex items-end gap-2">
            {activeStores.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm">Loja</label>
                <select
                  className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {activeStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm">Valor de abertura (R$)</label>
              <Input
                placeholder="0,00"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </div>
            <Button
              loading={openSessionMutation.isPending}
              disabled={!effectiveStoreId}
              onClick={() => openSessionMutation.mutate()}
            >
              Abrir caixa
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm dark:border-green-900 dark:bg-green-950">
            <span>Caixa aberto — abertura {formatCentsToBRL(sessionQuery.data.openingAmountCents)}</span>
            <div className="flex items-center gap-2">
              {!isOnline && (
                <Badge variant="warning" className="flex items-center gap-1">
                  <WifiOff className="h-3 w-3" />
                  Sem conexão
                </Badge>
              )}
              <Badge variant="success">Aberto</Badge>
            </div>
          </div>

          {!isOnline && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <CloudOff className="h-3.5 w-3.5" />
              Vendas continuam funcionando offline — ficam salvas neste dispositivo e são enviadas automaticamente quando a
              internet voltar. Preços e estoque exibidos são os últimos conhecidos
              {productsQuery.dataUpdatedAt ? ` (${new Date(productsQuery.dataUpdatedAt).toLocaleTimeString('pt-BR')})` : ''}.
            </p>
          )}

          {(pendingSales.length > 0 || attentionSales.length > 0) && (
            <Card className="flex flex-col gap-3">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <CloudOff className="h-4 w-4" />
                Vendas offline
              </h2>
              {pendingSales.length > 0 && (
                <p className="text-sm text-muted">
                  {pendingSales.length} venda(s) aguardando conexão pra sincronizar
                  {isOnline ? ' (tentando agora)...' : '.'}
                </p>
              )}
              {attentionSales.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-500">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {attentionSales.length} venda(s) offline não puderam ser sincronizadas — precisam de atenção:
                  </p>
                  {attentionSales.map((sale) => (
                    <div
                      key={sale.clientSaleId}
                      className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span>
                          Venda de {new Date(sale.queuedAt).toLocaleString('pt-BR')} —{' '}
                          {formatSaleQueueTotal(sale)}
                        </span>
                        <span className="text-amber-700 dark:text-amber-500">{sale.lastError}</span>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-red-600 hover:underline"
                        onClick={() => discardAttentionSale(sale.clientSaleId)}
                      >
                        Descartar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <AnimatePresence>
            {lastSale && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950">
                  <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="flex flex-col gap-1">
                    <span>
                      Venda registrada: {formatCentsToBRL(lastSale.totalCents)} ({lastSale.items.length} ite
                      {lastSale.items.length === 1 ? 'm' : 'ns'})
                    </span>
                    {lastSale.fiscalDocument?.status === 'authorized' && (
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        NFC-e autorizada (sandbox) — chave {lastSale.fiscalDocument.accessKey}
                      </span>
                    )}
                    {lastSale.fiscalDocument?.status === 'rejected' && (
                      <span className="text-xs text-amber-700 dark:text-amber-500">
                        NFC-e não emitida: {lastSale.fiscalDocument.rejectionReason}. Reemita depois em Vendas.
                      </span>
                    )}
                    {lastSale.pointsEarned > 0 && (
                      <span className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        <Gift className="h-3.5 w-3.5" />
                        Cliente ganhou {lastSale.pointsEarned} ponto(s) de fidelidade
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-medium">Nova venda</h2>

            <div className="flex flex-col gap-1.5 sm:w-80">
              <label className="text-sm">Cliente (opcional)</label>
              <select
                className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setPointsToRedeemInput('');
                }}
              >
                <option value="">Sem cliente identificado</option>
                {customersQuery.data?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
              {selectedCustomerId && customerBalanceQuery.data && (
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Gift className="h-3.5 w-3.5" />
                  {customerBalanceQuery.data.balancePoints} ponto(s) disponível(is) — vale{' '}
                  {formatCentsToBRL(customerBalanceQuery.data.balanceValueCents)}
                </p>
              )}
            </div>

            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm">Produto</label>
                <select
                  className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {productsQuery.data
                    ?.filter((p) => p.active)
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} — {formatCentsToBRL(product.priceCents)}
                      </option>
                    ))}
                </select>
              </div>
              <Button type="button" variant="secondary" onClick={addToCart} disabled={!selectedProductId}>
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>

            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1">Produto</th>
                  <th className="py-1">Qtd.</th>
                  <th className="py-1">Preço</th>
                  <th className="py-1">Total</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {cart.map((line) => (
                    <motion.tr
                      key={line.productId}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-t border-border"
                    >
                      <td className="py-1.5">{line.name}</td>
                      <td className="py-1.5">{line.quantity}</td>
                      <td className="py-1.5">{formatCentsToBRL(line.priceCents)}</td>
                      <td className="py-1.5">{formatCentsToBRL(line.priceCents * line.quantity)}</td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          className="text-red-600 transition-colors hover:text-red-500"
                          onClick={() => removeFromCart(line.productId)}
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            {cart.length === 0 && <EmptyState icon={ShoppingCart} message="Carrinho vazio" />}

            <div className="flex flex-col gap-1.5 self-end sm:w-64">
              <label className="text-sm">Desconto (R$)</label>
              <Input placeholder="0,00" value={discountReais} onChange={(e) => setDiscountReais(e.target.value)} />
            </div>

            {selectedCustomerId && !!customerBalanceQuery.data?.balancePoints && (
              <div className="flex flex-col gap-1.5 self-end sm:w-64">
                <label className="text-sm">Resgatar pontos (máx. {customerBalanceQuery.data.balancePoints})</label>
                <Input
                  type="number"
                  min={0}
                  max={customerBalanceQuery.data.balancePoints}
                  placeholder="0"
                  value={pointsToRedeemInput}
                  onChange={(e) => setPointsToRedeemInput(e.target.value)}
                />
                {pointsToRedeem > 0 && (
                  <p className="text-xs text-muted">desconto de {formatCentsToBRL(redemptionValueCents)}</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1 self-end text-right text-sm sm:w-64">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span>{formatCentsToBRL(subtotalCents)}</span>
              </div>
              {redemptionValueCents > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Resgate de pontos</span>
                  <span>-{formatCentsToBRL(redemptionValueCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{formatCentsToBRL(totalCents)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Pagamento</h3>
                <Button type="button" variant="secondary" onClick={addPaymentLine}>
                  <Plus className="h-4 w-4" />
                  Forma de pagamento
                </Button>
              </div>
              <AnimatePresence initial={false}>
                {payments.map((payment, index) => (
                  <motion.div
                    key={index}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-end gap-2"
                  >
                    <div className="flex flex-1 flex-col gap-1.5">
                      <label className="text-sm">Método</label>
                      <select
                        className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                        value={payment.method}
                        onChange={(e) => updatePayment(index, { method: e.target.value as PaymentMethod })}
                      >
                        {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <label className="text-sm">Valor (R$)</label>
                      <Input
                        placeholder="0,00"
                        value={payment.amountReais}
                        onChange={(e) => updatePayment(index, { amountReais: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center text-red-600 transition-colors hover:text-red-500"
                      onClick={() => removePayment(index)}
                      aria-label="Remover forma de pagamento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <p className={`text-right text-sm ${remainingCents === 0 ? 'text-green-600' : 'text-muted'}`}>
                {remainingCents > 0
                  ? `Falta ${formatCentsToBRL(remainingCents)}`
                  : remainingCents < 0
                    ? `Excedente ${formatCentsToBRL(-remainingCents)}`
                    : 'Pagamento completo'}
              </p>
            </div>

            {saleError && <p className="text-sm text-red-600">{saleError}</p>}

            <Button
              className="self-start"
              disabled={cart.length === 0 || remainingCents !== 0}
              loading={createSaleMutation.isPending}
              onClick={() => createSaleMutation.mutate()}
            >
              Finalizar venda
            </Button>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-medium">Sangria / suprimento</h2>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm">Tipo</label>
                <select
                  className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as 'sangria' | 'suprimento')}
                >
                  <option value="sangria">Sangria (retirada)</option>
                  <option value="suprimento">Suprimento (reforço)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm">Valor (R$)</label>
                <Input placeholder="0,00" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm">Motivo (opcional)</label>
                <Input value={movementReason} onChange={(e) => setMovementReason(e.target.value)} />
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={addMovementMutation.isPending}
                onClick={() => addMovementMutation.mutate()}
              >
                Registrar
              </Button>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-medium">Fechar caixa</h2>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm">Valor contado (R$)</label>
                <Input placeholder="0,00" value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} />
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={closeSessionMutation.isPending}
                onClick={() => closeSessionMutation.mutate()}
              >
                Fechar caixa
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
