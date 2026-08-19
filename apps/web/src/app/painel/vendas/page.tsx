'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useState } from 'react';
import { ChevronDown, Printer, Receipt, RefreshCw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  Customer,
  CreateSaleReturnInput,
  PaymentMethod,
  Sale,
  SaleListItem,
  SaleReturn,
  SaleReturnRefundMethod,
  Store,
} from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { SaleReceipt } from '@/components/pdv/sale-receipt';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
};

const REFUND_METHOD_LABELS: Record<SaleReturnRefundMethod, string> = {
  dinheiro: 'Dinheiro (do caixa aberto)',
  estorno_pagamento: 'Estorno no cartão/Pix',
  outro: 'Outro (troca, crédito combinado à parte...)',
};

const RETURN_STATUS_BADGE: Record<SaleReturn['status'], { label: string; variant: BadgeVariant }> = {
  completed: { label: 'Concluída', variant: 'success' },
  needs_attention: { label: 'Precisa de atenção', variant: 'warning' },
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function SaleDetail({
  sale,
  storeName,
  companyName,
}: {
  sale: Sale;
  storeName: string | undefined;
  companyName: string;
}) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const [returnFormOpen, setReturnFormOpen] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnMethod, setReturnMethod] = useState<SaleReturnRefundMethod>('dinheiro');

  const retryMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/sales/${sale.id}/fiscal-document/retry`, {
        method: 'POST',
        accessToken: accessToken!,
      }),
    onSuccess: () => {
      toast.success('NFC-e reemitida');
      queryClient.invalidateQueries({ queryKey: ['sales', sale.id] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao reemitir NFC-e');
    },
  });

  const returnsQuery = useQuery({
    queryKey: ['sales', sale.id, 'returns'],
    queryFn: () => apiFetch<SaleReturn[]>(`/sales/${sale.id}/returns`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const alreadyReturnedByItem = new Map<string, number>();
  for (const ret of returnsQuery.data ?? []) {
    for (const item of ret.items) {
      alreadyReturnedByItem.set(item.saleItemId, (alreadyReturnedByItem.get(item.saleItemId) ?? 0) + item.quantity);
    }
  }
  const remaining = (saleItemId: string, originalQuantity: number) =>
    originalQuantity - (alreadyReturnedByItem.get(saleItemId) ?? 0);

  const returnMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(returnQuantities)
        .map(([saleItemId, quantity]) => ({ saleItemId, quantity: Number(quantity) }))
        .filter((item) => item.quantity > 0);
      const body: CreateSaleReturnInput = { refundMethod: returnMethod, reason: returnReason, items };
      return apiFetch<SaleReturn>(`/sales/${sale.id}/returns`, { method: 'POST', accessToken: accessToken!, body });
    },
    onSuccess: (created) => {
      if (created.status === 'needs_attention') {
        toast.warning(created.issue ?? 'Devolução registrada, mas precisa de atenção');
      } else {
        toast.success('Devolução registrada');
      }
      setReturnFormOpen(false);
      setReturnQuantities({});
      setReturnReason('');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao registrar devolução');
    },
  });

  const hasQuantityToReturn = Object.values(returnQuantities).some((q) => Number(q) > 0);

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-zinc-50 px-4 py-3 dark:bg-zinc-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted">
            {sale.items.length} ite{sale.items.length === 1 ? 'm' : 'ns'} · Venda{' '}
            {sale.id.slice(0, 8)}
          </span>
          {sale.fiscalDocument?.status === 'authorized' && (
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              NFC-e autorizada — chave {sale.fiscalDocument.accessKey}
            </span>
          )}
          {sale.fiscalDocument?.status === 'rejected' && (
            <span className="text-xs text-amber-700 dark:text-amber-500">
              NFC-e não emitida: {sale.fiscalDocument.rejectionReason}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {sale.fiscalDocument?.status === 'rejected' && (
            <Button
              variant="secondary"
              loading={retryMutation.isPending}
              onClick={() => retryMutation.mutate()}
            >
              <RefreshCw className="h-4 w-4" />
              Reemitir NFC-e
            </Button>
          )}
          {sale.status === 'completed' && (
            <Button variant="secondary" onClick={() => setReturnFormOpen((open) => !open)}>
              <Undo2 className="h-4 w-4" />
              Devolver
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir cupom
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-1.5 font-medium">Produto</th>
              <th className="px-3 py-1.5 font-medium">Qtd</th>
              <th className="px-3 py-1.5 font-medium">Unitário</th>
              <th className="px-3 py-1.5 font-medium">Total</th>
              {returnFormOpen && <th className="px-3 py-1.5 font-medium">Devolver</th>}
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => {
              const returnable = remaining(item.id, item.quantity);
              return (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-3 py-1.5">{item.productName}</td>
                  <td className="px-3 py-1.5">{item.quantity}</td>
                  <td className="px-3 py-1.5">{formatCentsToBRL(item.unitPriceCents)}</td>
                  <td className="px-3 py-1.5">{formatCentsToBRL(item.totalCents)}</td>
                  {returnFormOpen && (
                    <td className="px-3 py-1.5">
                      {returnable > 0 ? (
                        <Input
                          type="number"
                          min={0}
                          max={returnable}
                          placeholder="0"
                          className="h-8 w-20"
                          value={returnQuantities[item.id] ?? ''}
                          onChange={(e) => setReturnQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                      ) : (
                        <span className="text-xs text-muted">já devolvido</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {returnFormOpen && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm">Motivo</label>
              <Input
                placeholder="Ex.: produto com defeito, cliente desistiu..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:w-64">
              <label className="text-sm">Reembolso</label>
              <select
                className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                value={returnMethod}
                onChange={(e) => setReturnMethod(e.target.value as SaleReturnRefundMethod)}
              >
                {(Object.entries(REFUND_METHOD_LABELS) as [SaleReturnRefundMethod, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              loading={returnMutation.isPending}
              disabled={!hasQuantityToReturn || returnReason.trim().length < 3}
              onClick={() => returnMutation.mutate()}
            >
              Confirmar devolução
            </Button>
          </div>
        </div>
      )}

      {(returnsQuery.data?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Devoluções desta venda</span>
          <div className="flex flex-col gap-1.5">
            {returnsQuery.data!.map((ret) => (
              <div
                key={ret.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs"
              >
                <span className="text-muted">
                  {formatDateTime(ret.createdAt)} · {ret.reason}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatCentsToBRL(ret.totalRefundedCents)}</span>
                  <Badge variant={RETURN_STATUS_BADGE[ret.status].variant}>{RETURN_STATUS_BADGE[ret.status].label}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm text-muted">
        {sale.payments.map((payment) => (
          <span key={payment.id}>
            {PAYMENT_LABELS[payment.method]}: {formatCentsToBRL(payment.amountCents)}
          </span>
        ))}
      </div>

      <SaleReceipt sale={sale} companyName={companyName} storeName={storeName} />
    </div>
  );
}

export default function VendasPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const salesQuery = useQuery({
    queryKey: ['sales'],
    queryFn: () => apiFetch<SaleListItem[]>('/sales', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const storesQuery = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiFetch<Store[]>('/stores', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<Customer[]>('/customers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const detailQuery = useQuery({
    queryKey: ['sales', expandedId],
    queryFn: () => apiFetch<Sale>(`/sales/${expandedId}`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!expandedId,
  });

  if (!accessToken) {
    return null;
  }

  const storeName = (id: string) => storesQuery.data?.find((store) => store.id === id)?.name ?? '—';
  const customerName = (id: string | null) =>
    id ? (customersQuery.data?.find((customer) => customer.id === id)?.name ?? '—') : '—';

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>

      <div className="overflow-x-auto rounded-lg border border-border">
        {!salesQuery.data ? (
          <SkeletonRows rows={5} cols={5} />
        ) : salesQuery.data.length === 0 ? (
          <EmptyState icon={Receipt} message="Nenhuma venda registrada ainda." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Loja</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {salesQuery.data.map((sale) => {
                const isExpanded = expandedId === sale.id;
                return (
                  <Fragment key={sale.id}>
                    <tr
                      className="cursor-pointer border-t border-border hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                    >
                      <td className="px-4 py-2">{formatDateTime(sale.createdAt)}</td>
                      <td className="px-4 py-2">{storeName(sale.storeId)}</td>
                      <td className="px-4 py-2">{customerName(sale.customerId)}</td>
                      <td className="px-4 py-2 font-medium">{formatCentsToBRL(sale.totalCents)}</td>
                      <td className="px-4 py-2">
                        {sale.status === 'completed' ? (
                          <Badge variant="success">Concluída</Badge>
                        ) : (
                          <Badge variant="danger">Cancelada</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <ChevronDown
                          className={`ml-auto h-4 w-4 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <AnimatePresence>
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                            >
                              {!detailQuery.data ? (
                                <SkeletonRows rows={2} cols={4} />
                              ) : (
                                <SaleDetail
                                  sale={detailQuery.data}
                                  storeName={
                                    storesQuery.data?.find((store) => store.id === sale.storeId)
                                      ?.name
                                  }
                                  companyName={meQuery.data?.tenant.companyName ?? ''}
                                />
                              )}
                            </motion.div>
                          </AnimatePresence>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
