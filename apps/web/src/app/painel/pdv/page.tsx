'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Gift, Plus, Receipt, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CashSession, Customer, CustomerLoyaltyBalance, LoyaltyProgram, PaymentMethod, Product, Sale, Store } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL, parseBRLToCents } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
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

  const createSaleMutation = useMutation({
    mutationFn: () =>
      apiFetch<Sale>('/sales', {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          customerId: selectedCustomerId || undefined,
          items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          discountCents,
          pointsToRedeem,
          payments: payments.map((p) => ({ method: p.method, amountCents: parseBRLToCents(p.amountReais || '0') })),
        },
      }),
    onSuccess: (sale) => {
      setLastSale(sale);
      setCart([]);
      setPayments([]);
      setDiscountReais('');
      setPointsToRedeemInput('');
      setSaleError(null);
      queryClient.invalidateQueries({ queryKey: ['loyalty-balance', selectedCustomerId] });
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
            <Badge variant="success">Aberto</Badge>
          </div>

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
