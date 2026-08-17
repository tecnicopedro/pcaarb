'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CashSession, PaymentMethod, Product, Sale } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL, parseBRLToCents } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  const router = useRouter();
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (accessToken === null) {
      router.replace('/login');
    }
  }, [accessToken, router]);

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

  const [openingAmount, setOpeningAmount] = useState('');
  const openSessionMutation = useMutation({
    mutationFn: () =>
      apiFetch<CashSession>('/cash-sessions', {
        method: 'POST',
        accessToken: accessToken!,
        body: { openingAmountCents: parseBRLToCents(openingAmount || '0') },
      }),
    onSuccess: () => {
      setOpeningAmount('');
      queryClient.invalidateQueries({ queryKey: ['current-cash-session'] });
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
  const totalCents = Math.max(subtotalCents - discountCents, 0);
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
          items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          discountCents,
          payments: payments.map((p) => ({ method: p.method, amountCents: parseBRLToCents(p.amountReais || '0') })),
        },
      }),
    onSuccess: (sale) => {
      setLastSale(sale);
      setCart([]);
      setPayments([]);
      setDiscountReais('');
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
    },
  });

  if (!accessToken || sessionQuery.isLoading) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <div>
        <Link href="/painel" className="text-sm text-zinc-500 underline">
          &larr; Painel
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">PDV</h1>
      </div>

      {!sessionQuery.data ? (
        <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="font-medium">Abrir caixa</h2>
          <p className="text-sm text-zinc-500">Informe o valor em dinheiro que está começando no caixa.</p>
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm">Valor de abertura (R$)</label>
              <Input
                placeholder="0,00"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </div>
            <Button onClick={() => openSessionMutation.mutate()} disabled={openSessionMutation.isPending}>
              {openSessionMutation.isPending ? 'Abrindo...' : 'Abrir caixa'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm dark:border-green-900 dark:bg-green-950">
            <span>
              Caixa aberto — abertura {formatCentsToBRL(sessionQuery.data.openingAmountCents)}
            </span>
          </div>

          {lastSale && (
            <div className="flex flex-col gap-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950">
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
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="text-sm font-medium">Nova venda</h2>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm">Produto</label>
                <select
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
              <Button type="button" onClick={addToCart} disabled={!selectedProductId}>
                Adicionar
              </Button>
            </div>

            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="py-1">Produto</th>
                  <th className="py-1">Qtd.</th>
                  <th className="py-1">Preço</th>
                  <th className="py-1">Total</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => (
                  <tr key={line.productId} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5">{line.name}</td>
                    <td className="py-1.5">{line.quantity}</td>
                    <td className="py-1.5">{formatCentsToBRL(line.priceCents)}</td>
                    <td className="py-1.5">{formatCentsToBRL(line.priceCents * line.quantity)}</td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        className="text-red-600 underline"
                        onClick={() => removeFromCart(line.productId)}
                      >
                        remover
                      </button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td className="py-4 text-center text-zinc-400" colSpan={5}>
                      Carrinho vazio
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="flex flex-col gap-1.5 self-end sm:w-64">
              <label className="text-sm">Desconto (R$)</label>
              <Input
                placeholder="0,00"
                value={discountReais}
                onChange={(e) => setDiscountReais(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1 self-end text-right text-sm sm:w-64">
              <div className="flex justify-between">
                <span className="text-zinc-500">Subtotal</span>
                <span>{formatCentsToBRL(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatCentsToBRL(totalCents)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Pagamento</h3>
                <Button type="button" onClick={addPaymentLine}>
                  + Forma de pagamento
                </Button>
              </div>
              {payments.map((payment, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <label className="text-sm">Método</label>
                    <select
                      className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                    className="h-10 px-2 text-sm text-red-600 underline"
                    onClick={() => removePayment(index)}
                  >
                    remover
                  </button>
                </div>
              ))}
              <p className={`text-right text-sm ${remainingCents === 0 ? 'text-green-600' : 'text-zinc-500'}`}>
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
              disabled={cart.length === 0 || remainingCents !== 0 || createSaleMutation.isPending}
              onClick={() => createSaleMutation.mutate()}
            >
              {createSaleMutation.isPending ? 'Registrando...' : 'Finalizar venda'}
            </Button>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="text-sm font-medium">Sangria / suprimento</h2>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm">Tipo</label>
                <select
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as 'sangria' | 'suprimento')}
                >
                  <option value="sangria">Sangria (retirada)</option>
                  <option value="suprimento">Suprimento (reforço)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm">Valor (R$)</label>
                <Input
                  placeholder="0,00"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm">Motivo (opcional)</label>
                <Input value={movementReason} onChange={(e) => setMovementReason(e.target.value)} />
              </div>
              <Button
                type="button"
                onClick={() => addMovementMutation.mutate()}
                disabled={addMovementMutation.isPending}
              >
                Registrar
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="text-sm font-medium">Fechar caixa</h2>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm">Valor contado (R$)</label>
                <Input
                  placeholder="0,00"
                  value={closingAmount}
                  onChange={(e) => setClosingAmount(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => closeSessionMutation.mutate()}
                disabled={closeSessionMutation.isPending}
              >
                {closeSessionMutation.isPending ? 'Fechando...' : 'Fechar caixa'}
              </Button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
