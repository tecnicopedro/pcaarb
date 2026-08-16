'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { Customer, FinanceCashflowSummary, FinanceEntry, Supplier } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL, parseBRLToCents } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const entryFormSchema = z.object({
  type: z.enum(['payable', 'receivable']),
  description: z.string().min(2, 'Descrição muito curta'),
  amountReais: z.string().min(1, 'Informe o valor'),
  dueDate: z.string().min(1, 'Informe o vencimento'),
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
});

type EntryFormValues = z.infer<typeof entryFormSchema>;

const STATUS_LABELS: Record<FinanceEntry['status'], string> = {
  pending: 'Pendente',
  paid: 'Paga',
  canceled: 'Cancelada',
};

function isOverdue(entry: FinanceEntry): boolean {
  return entry.status === 'pending' && entry.dueDate < new Date().toISOString().slice(0, 10);
}

export default function FinanceiroPage() {
  const router = useRouter();
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (accessToken === null) {
      router.replace('/login');
    }
  }, [accessToken, router]);

  const entriesQuery = useQuery({
    queryKey: ['finance-entries'],
    queryFn: () => apiFetch<FinanceEntry[]>('/finance-entries', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const summaryQuery = useQuery({
    queryKey: ['finance-entries', 'summary'],
    queryFn: () => apiFetch<FinanceCashflowSummary>('/finance-entries/summary', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<Customer[]>('/customers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiFetch<Supplier[]>('/suppliers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
    setError,
  } = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: { type: 'payable' },
  });
  const selectedType = useWatch({ control, name: 'type' });

  function invalidateFinance() {
    queryClient.invalidateQueries({ queryKey: ['finance-entries'] });
  }

  const createMutation = useMutation({
    mutationFn: (values: EntryFormValues) =>
      apiFetch<FinanceEntry>('/finance-entries', {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          type: values.type,
          description: values.description,
          amountCents: parseBRLToCents(values.amountReais),
          dueDate: values.dueDate,
          customerId: values.type === 'receivable' && values.customerId ? values.customerId : undefined,
          supplierId: values.type === 'payable' && values.supplierId ? values.supplierId : undefined,
        },
      }),
    onSuccess: () => {
      reset({ type: 'payable' });
      invalidateFinance();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/finance-entries/${id}/pay`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: invalidateFinance,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/finance-entries/${id}/cancel`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: invalidateFinance,
  });

  if (!accessToken) {
    return null;
  }

  const summary = summaryQuery.data;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/painel" className="text-sm text-zinc-500 underline">
            &larr; Painel
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Financeiro</h1>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">A receber (pendente)</p>
            <p className="text-lg font-semibold">{formatCentsToBRL(summary.pendingReceivableCents)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">A pagar (pendente)</p>
            <p className="text-lg font-semibold">{formatCentsToBRL(summary.pendingPayableCents)}</p>
            {summary.overduePayableCents > 0 && (
              <p className="text-xs text-red-600">{formatCentsToBRL(summary.overduePayableCents)} vencido</p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">Recebido</p>
            <p className="text-lg font-semibold">{formatCentsToBRL(summary.paidReceivableCents)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">Saldo (recebido - pago)</p>
            <p className={`text-lg font-semibold ${summary.netCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCentsToBRL(summary.netCents)}
            </p>
          </div>
        </div>
      )}

      <form
        className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        onSubmit={handleSubmit((values) => createMutation.mutate(values))}
      >
        <h2 className="text-sm font-medium">Nova conta</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Tipo</label>
            <select
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              {...register('type')}
            >
              <option value="payable">A pagar</option>
              <option value="receivable">A receber</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Descrição</label>
            <Input {...register('description')} />
            {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Valor (R$)</label>
            <Input placeholder="0,00" {...register('amountReais')} />
            {errors.amountReais && <p className="text-sm text-red-600">{errors.amountReais.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Vencimento</label>
            <Input type="date" {...register('dueDate')} />
            {errors.dueDate && <p className="text-sm text-red-600">{errors.dueDate.message}</p>}
          </div>
          {selectedType === 'receivable' && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm">Cliente (opcional)</label>
              <select
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                {...register('customerId')}
              >
                <option value="">Sem cliente</option>
                {customersQuery.data?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedType === 'payable' && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm">Fornecedor (opcional)</label>
              <select
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                {...register('supplierId')}
              >
                <option value="">Sem fornecedor</option>
                {suppliersQuery.data?.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
        <Button type="submit" disabled={createMutation.isPending} className="self-start">
          {createMutation.isPending ? 'Salvando...' : 'Adicionar conta'}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500">
          {entriesQuery.data ? `${entriesQuery.data.length} conta(s)` : 'Carregando...'}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Descrição</th>
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Vencimento</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {entriesQuery.data?.map((entry) => (
                <tr key={entry.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-2">{entry.type === 'payable' ? 'A pagar' : 'A receber'}</td>
                  <td className="px-4 py-2">{entry.description}</td>
                  <td className="px-4 py-2">{formatCentsToBRL(entry.amountCents)}</td>
                  <td className="px-4 py-2">{entry.dueDate}</td>
                  <td className="px-4 py-2">
                    {isOverdue(entry) ? (
                      <span className="text-red-600">Vencida</span>
                    ) : entry.status === 'paid' ? (
                      <span className="text-green-600">{STATUS_LABELS[entry.status]}</span>
                    ) : (
                      <span className="text-zinc-500">{STATUS_LABELS[entry.status]}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {entry.status === 'pending' && (
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          className="text-xs text-green-600 underline"
                          disabled={payMutation.isPending}
                          onClick={() => payMutation.mutate(entry.id)}
                        >
                          Pagar
                        </button>
                        <button
                          type="button"
                          className="text-xs text-zinc-500 underline"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(entry.id)}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {entriesQuery.data?.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-400" colSpan={6}>
                    Nenhuma conta cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
