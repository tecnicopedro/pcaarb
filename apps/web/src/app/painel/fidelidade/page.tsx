'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Gift, History } from 'lucide-react';
import { toast } from 'sonner';
import type { Customer, CustomerLoyaltyBalance, LoyaltyLedgerEntry, LoyaltyProgram } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

const LEDGER_LABELS: Record<LoyaltyLedgerEntry['type'], { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  earn: { label: 'Ganho', variant: 'success' },
  redeem: { label: 'Resgate', variant: 'warning' },
  adjustment: { label: 'Ajuste', variant: 'neutral' },
};

function ProgramSettings() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const canEdit = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';

  const programQuery = useQuery({
    queryKey: ['loyalty-program'],
    queryFn: () => apiFetch<LoyaltyProgram>('/loyalty/program', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  if (!accessToken || !programQuery.data) {
    return (
      <Card className="flex flex-col gap-4">
        <SkeletonRows rows={2} cols={1} />
      </Card>
    );
  }

  return <ProgramSettingsForm program={programQuery.data} canEdit={canEdit} />;
}

// Separate component, mounted only once programQuery.data already exists: the
// useState calls below initialize directly with the loaded data, without
// needing a useEffect to sync (avoids the cascading render that causes).
function ProgramSettingsForm({ program, canEdit }: { program: LoyaltyProgram; canEdit: boolean }) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  const [active, setActive] = useState(program.active);
  const [earnRate, setEarnRate] = useState(String(program.earnRatePoints));
  const [redeemValue, setRedeemValue] = useState(String(program.redeemValueCents));

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch<LoyaltyProgram>('/loyalty/program', {
        method: 'PATCH',
        accessToken: accessToken!,
        body: {
          active,
          earnRatePoints: Number.parseInt(earnRate, 10) || 0,
          redeemValueCents: Number.parseInt(redeemValue, 10) || 1,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-program'] });
      toast.success('Configuração de fidelidade atualizada');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao atualizar configuração');
    },
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Programa de pontos</h2>
        <Badge variant={active ? 'success' : 'neutral'}>{active ? 'Ativo' : 'Inativo'}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={active}
            disabled={!canEdit}
            onChange={(e) => setActive(e.target.checked)}
          />
          Programa ativo
        </label>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">Pontos por R$1 gasto</label>
          <Input
            type="number"
            min={0}
            value={earnRate}
            disabled={!canEdit}
            onChange={(e) => setEarnRate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">Valor de 1 ponto no resgate</label>
          <Input
            type="number"
            min={1}
            value={redeemValue}
            disabled={!canEdit}
            onChange={(e) => setRedeemValue(e.target.value)}
          />
          <p className="text-xs text-muted">
            {Number.parseInt(redeemValue, 10) || 0} centavo(s) — 100 pontos valem{' '}
            {formatCentsToBRL((Number.parseInt(redeemValue, 10) || 0) * 100)}
          </p>
        </div>
      </div>

      {canEdit && (
        <Button
          className="self-start"
          loading={updateMutation.isPending}
          onClick={() => updateMutation.mutate()}
        >
          Salvar
        </Button>
      )}
    </Card>
  );
}

function CustomerLookup() {
  const accessToken = useAccessToken();
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<Customer[]>('/customers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const balanceQuery = useQuery({
    queryKey: ['loyalty-balance', selectedCustomerId],
    queryFn: () => apiFetch<CustomerLoyaltyBalance>(`/customers/${selectedCustomerId}/loyalty/balance`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedCustomerId,
  });

  const ledgerQuery = useQuery({
    queryKey: ['loyalty-ledger', selectedCustomerId],
    queryFn: () => apiFetch<LoyaltyLedgerEntry[]>(`/customers/${selectedCustomerId}/loyalty/ledger`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedCustomerId,
  });

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium">Consultar cliente</h2>
      <div className="flex flex-col gap-1.5 sm:w-80">
        <label className="text-sm">Cliente</label>
        <select
          className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          value={selectedCustomerId}
          onChange={(e) => setSelectedCustomerId(e.target.value)}
        >
          <option value="">Selecione...</option>
          {customersQuery.data?.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>

      {selectedCustomerId && (
        <>
          {balanceQuery.data && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-accent-soft/40 px-4 py-3">
              <Gift className="h-5 w-5 text-accent" />
              <div>
                <p className="text-lg font-semibold">{balanceQuery.data.balancePoints} pontos</p>
                <p className="text-sm text-muted">
                  equivalentes a {formatCentsToBRL(balanceQuery.data.balanceValueCents)} em resgate
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted">Histórico</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              {!ledgerQuery.data ? (
                <SkeletonRows rows={3} cols={3} />
              ) : ledgerQuery.data.length === 0 ? (
                <EmptyState icon={History} message="Nenhuma movimentação de pontos ainda." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-2 font-medium">Data</th>
                      <th className="px-4 py-2 font-medium">Tipo</th>
                      <th className="px-4 py-2 font-medium">Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerQuery.data.map((entry) => (
                      <tr key={entry.id} className="border-t border-border">
                        <td className="px-4 py-2 text-muted">{new Date(entry.createdAt).toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2">
                          <Badge variant={LEDGER_LABELS[entry.type].variant}>{LEDGER_LABELS[entry.type].label}</Badge>
                        </td>
                        <td className={`px-4 py-2 font-medium ${entry.points >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {entry.points > 0 ? '+' : ''}
                          {entry.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

export default function FidelidadePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Fidelidade</h1>
      <ProgramSettings />
      <CustomerLookup />
    </>
  );
}
