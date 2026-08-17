'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Percent, Trophy, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import type { CommissionReport, CommissionSettings, SellerCommissionRate, User } from '@pcaarb/shared';
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

// Basis points <-> percentual exibido: 500 bps = 5%. Conversão só na borda
// UI — a API e o banco trabalham sempre em bps (inteiro), nunca em float.
function bpsToPercentText(bps: number): string {
  return (bps / 100).toString();
}
function percentTextToBps(text: string): number {
  return Math.round((Number.parseFloat(text) || 0) * 100);
}

function CommissionSettingsSection() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const canEdit = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';

  const settingsQuery = useQuery({
    queryKey: ['commission-settings'],
    queryFn: () => apiFetch<CommissionSettings>('/commissions/settings', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  if (!accessToken || !settingsQuery.data) {
    return (
      <Card className="flex flex-col gap-4">
        <SkeletonRows rows={2} cols={1} />
      </Card>
    );
  }

  return <SettingsForm settings={settingsQuery.data} canEdit={canEdit} />;
}

// Mesmo padrão de ProgramSettingsForm em fidelidade/page.tsx: componente à
// parte, montado só quando settingsQuery.data já existe — useState inicializa
// direto dos dados carregados, sem useEffect de sincronização.
function SettingsForm({ settings, canEdit }: { settings: CommissionSettings; canEdit: boolean }) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  const [active, setActive] = useState(settings.active);
  const [ratePercent, setRatePercent] = useState(bpsToPercentText(settings.defaultRateBps));

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch<CommissionSettings>('/commissions/settings', {
        method: 'PATCH',
        accessToken: accessToken!,
        body: { active, defaultRateBps: percentTextToBps(ratePercent) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-settings'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'comissoes'] });
      toast.success('Configuração de comissão atualizada');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao atualizar configuração');
    },
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Comissão padrão</h2>
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
          Comissão ativa
        </label>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">Taxa padrão (% da venda)</label>
          <Input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={ratePercent}
            disabled={!canEdit}
            onChange={(e) => setRatePercent(e.target.value)}
          />
          <p className="text-xs text-muted">Aplicada a todo vendedor sem taxa individual configurada abaixo.</p>
        </div>
      </div>

      {canEdit && (
        <Button className="self-start" loading={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
          Salvar
        </Button>
      )}
    </Card>
  );
}

function SellerRates() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const canEdit = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [ratePercent, setRatePercent] = useState('');

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<User[]>('/users', { accessToken: accessToken! }),
    enabled: !!accessToken && canEdit,
  });

  const ratesQuery = useQuery({
    queryKey: ['commission-rates'],
    queryFn: () => apiFetch<SellerCommissionRate[]>('/commissions/rates', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['commission-rates'] });
    queryClient.invalidateQueries({ queryKey: ['reports', 'comissoes'] });
  }

  const upsertMutation = useMutation({
    mutationFn: () =>
      apiFetch<SellerCommissionRate>(`/commissions/rates/${selectedUserId}`, {
        method: 'PUT',
        accessToken: accessToken!,
        body: { rateBps: percentTextToBps(ratePercent) },
      }),
    onSuccess: () => {
      setSelectedUserId('');
      setRatePercent('');
      invalidate();
      toast.success('Taxa individual salva');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao salvar taxa individual');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => apiFetch(`/commissions/rates/${userId}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: () => {
      invalidate();
      toast.success('Taxa individual removida — vendedor volta pra taxa padrão');
    },
  });

  const overriddenUserIds = new Set((ratesQuery.data ?? []).map((rate) => rate.userId));
  const availableUsers = (usersQuery.data ?? []).filter((user) => !overriddenUserIds.has(user.id));

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <UserCog className="h-4 w-4" />
        Taxas individuais por vendedor
      </h2>

      <div className="overflow-x-auto rounded-lg border border-border">
        {!ratesQuery.data ? (
          <SkeletonRows rows={2} cols={2} />
        ) : ratesQuery.data.length === 0 ? (
          <EmptyState icon={Percent} message="Nenhuma taxa individual — todos usam a taxa padrão." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-4 py-2 font-medium">Taxa</th>
                {canEdit && <th className="px-4 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {ratesQuery.data.map((rate) => (
                <tr key={rate.id} className="border-t border-border">
                  <td className="px-4 py-2">{rate.sellerName}</td>
                  <td className="px-4 py-2">{bpsToPercentText(rate.rateBps)}%</td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(rate.userId)}
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs">Vendedor</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs">Taxa (%)</label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              className="w-24"
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            loading={upsertMutation.isPending}
            disabled={!selectedUserId}
            onClick={() => upsertMutation.mutate()}
          >
            Salvar taxa
          </Button>
        </div>
      )}
    </Card>
  );
}

function buildPeriodQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function CommissionReportSection() {
  const accessToken = useAccessToken();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const period = buildPeriodQuery(from, to);

  const reportQuery = useQuery({
    queryKey: ['reports', 'comissoes', from, to],
    queryFn: () => apiFetch<CommissionReport>(`/reports/comissoes${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  return (
    <div className="flex flex-col gap-2">
      <Card className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">De</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">Até</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <p className="text-sm text-muted">
          {reportQuery.data
            ? `Período exibido: ${reportQuery.data.from} a ${reportQuery.data.to} — total ${formatCentsToBRL(reportQuery.data.totalCommissionCents)}`
            : 'Sem filtro, mostra os últimos 30 dias.'}
        </p>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border">
        {!reportQuery.data ? (
          <SkeletonRows rows={2} cols={4} />
        ) : reportQuery.data.porVendedor.length === 0 ? (
          <EmptyState icon={Trophy} message="Nenhuma venda no período." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-4 py-2 font-medium">Vendas</th>
                <th className="px-4 py-2 font-medium">Receita</th>
                <th className="px-4 py-2 font-medium">Taxa</th>
                <th className="px-4 py-2 font-medium">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {reportQuery.data.porVendedor.map((item) => (
                <tr key={item.sellerId} className="border-t border-border">
                  <td className="px-4 py-2">{item.sellerName}</td>
                  <td className="px-4 py-2">{item.totalSales}</td>
                  <td className="px-4 py-2">{formatCentsToBRL(item.revenueCents)}</td>
                  <td className="px-4 py-2 text-muted">{bpsToPercentText(item.rateBps)}%</td>
                  <td className="px-4 py-2 font-medium">{formatCentsToBRL(item.commissionCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function ComissoesPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Comissão de vendedores</h1>
      <CommissionSettingsSection />
      <SellerRates />
      <CommissionReportSection />
    </>
  );
}
