'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useState } from 'react';
import { ChevronDown, Printer, Receipt, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Customer, PaymentMethod, Sale, SaleListItem, Store } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { SaleReceipt } from '@/components/pdv/sale-receipt';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
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
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-3 py-1.5">{item.productName}</td>
                <td className="px-3 py-1.5">{item.quantity}</td>
                <td className="px-3 py-1.5">{formatCentsToBRL(item.unitPriceCents)}</td>
                <td className="px-3 py-1.5">{formatCentsToBRL(item.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
