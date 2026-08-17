'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Check, ClipboardList, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';
import type { StockCount } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

function diffLabel(expected: number, counted: number | null): string {
  if (counted === null) return '—';
  const delta = counted - expected;
  if (delta === 0) return '0';
  return delta > 0 ? `+${delta}` : String(delta);
}

function diffClassName(expected: number, counted: number | null): string {
  if (counted === null || counted === expected) return 'text-muted';
  return counted > expected ? 'text-green-600' : 'text-red-600';
}

export default function ContagensPage() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const countsQuery = useQuery({
    queryKey: ['stock-counts'],
    queryFn: () => apiFetch<StockCount[]>('/stock-counts', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const activeCount = useMemo(() => countsQuery.data?.find((count) => count.status === 'open'), [countsQuery.data]);

  function invalidateCounts() {
    queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  }

  const openMutation = useMutation({
    mutationFn: () =>
      apiFetch<StockCount>('/stock-counts', { method: 'POST', accessToken: accessToken!, body: { notes: notes || undefined } }),
    onSuccess: (count) => {
      setNotes('');
      invalidateCounts();
      if (count.items.length === 0) {
        toast.error('Nenhum produto com controle de estoque para contar');
      } else {
        toast.success('Contagem aberta');
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao abrir contagem');
    },
  });

  const setItemMutation = useMutation({
    mutationFn: ({ countId, itemId, countedQuantity }: { countId: string; itemId: string; countedQuantity: number }) =>
      apiFetch(`/stock-counts/${countId}/items/${itemId}`, {
        method: 'PATCH',
        accessToken: accessToken!,
        body: { countedQuantity },
      }),
    onSuccess: () => invalidateCounts(),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao registrar contagem do item');
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: (countId: string) => apiFetch(`/stock-counts/${countId}/finalize`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateCounts();
      toast.success('Contagem finalizada — estoque ajustado');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao finalizar contagem');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (countId: string) => apiFetch(`/stock-counts/${countId}/cancel`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateCounts();
      toast.success('Contagem cancelada');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao cancelar contagem');
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Inventário</h1>

      {!countsQuery.data ? (
        <Card>
          <SkeletonRows rows={3} cols={4} />
        </Card>
      ) : activeCount ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <ClipboardList className="h-4 w-4" />
              Contagem em andamento — {new Date(activeCount.createdAt).toLocaleDateString('pt-BR')}
            </h2>
            <div className="flex gap-2">
              <Button variant="secondary" loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate(activeCount.id)}>
                Cancelar
              </Button>
              <Button loading={finalizeMutation.isPending} onClick={() => finalizeMutation.mutate(activeCount.id)}>
                Finalizar contagem
              </Button>
            </div>
          </div>

          {activeCount.items.length === 0 ? (
            <EmptyState icon={PackageSearch} message="Nenhum produto com controle de estoque para contar." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2 font-medium">Produto</th>
                    <th className="px-4 py-2 font-medium">Sistema</th>
                    <th className="px-4 py-2 font-medium">Contado</th>
                    <th className="px-4 py-2 font-medium">Diferença</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {activeCount.items.map((item) => {
                    const draft = draftValues[item.id] ?? (item.countedQuantity !== null ? String(item.countedQuantity) : '');
                    const parsed = draft === '' ? null : Number.parseInt(draft, 10);
                    return (
                      <tr key={item.id} className="border-t border-border">
                        <td className="px-4 py-2">{item.productName}</td>
                        <td className="px-4 py-2 text-muted">{item.expectedQuantity}</td>
                        <td className="px-4 py-2">
                          <Input
                            className="w-24"
                            value={draft}
                            onChange={(e) => setDraftValues((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          />
                        </td>
                        <td className={`px-4 py-2 ${diffClassName(item.expectedQuantity, item.countedQuantity)}`}>
                          {diffLabel(item.expectedQuantity, item.countedQuantity)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
                            disabled={parsed === null || Number.isNaN(parsed) || parsed < 0 || setItemMutation.isPending}
                            onClick={() =>
                              parsed !== null &&
                              setItemMutation.mutate({ countId: activeCount.id, itemId: item.id, countedQuantity: parsed })
                            }
                          >
                            <Check className="h-3.5 w-3.5" />
                            Salvar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm">Observações (opcional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: contagem mensal" />
          </div>
          <Button loading={openMutation.isPending} onClick={() => openMutation.mutate()}>
            Abrir nova contagem
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">
          {countsQuery.data ? `${countsQuery.data.length} contagem(ns)` : ''}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!countsQuery.data ? (
            <SkeletonRows rows={3} cols={4} />
          ) : countsQuery.data.length === 0 ? (
            <EmptyState icon={ClipboardList} message="Nenhuma contagem de estoque ainda." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Aberta em</th>
                  <th className="px-4 py-2 font-medium">Itens</th>
                  <th className="px-4 py-2 font-medium">Observações</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {countsQuery.data.map((count) => (
                  <tr key={count.id} className="border-t border-border">
                    <td className="px-4 py-2">{new Date(count.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-2">{count.items.length}</td>
                    <td className="px-4 py-2 text-muted">{count.notes ?? '—'}</td>
                    <td className="px-4 py-2">
                      {count.status === 'completed' ? (
                        <Badge variant="success">Finalizada</Badge>
                      ) : count.status === 'canceled' ? (
                        <Badge variant="neutral">Cancelada</Badge>
                      ) : (
                        <Badge variant="warning">Em andamento</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
