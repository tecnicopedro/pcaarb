'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BarChart3, Landmark, Receipt, Store, Trophy, Wallet } from 'lucide-react';
import type { AbcCurveItem, DreSummary, SalesSummary, SellerRankingItem, StoreRankingItem } from '@pcaarb/shared';
import { apiFetch } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

const ABC_BADGE_VARIANT: Record<AbcCurveItem['class'], BadgeVariant> = {
  A: 'success',
  B: 'warning',
  C: 'neutral',
};

function buildPeriodQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function RelatoriosPage() {
  const accessToken = useAccessToken();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const period = buildPeriodQuery(from, to);

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => apiFetch<SalesSummary>(`/reports/vendas-resumo${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const abcQuery = useQuery({
    queryKey: ['reports', 'abc', from, to],
    queryFn: () => apiFetch<AbcCurveItem[]>(`/reports/curva-abc${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const sellersQuery = useQuery({
    queryKey: ['reports', 'sellers', from, to],
    queryFn: () => apiFetch<SellerRankingItem[]>(`/reports/vendedores-ranking${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const storesQuery = useQuery({
    queryKey: ['reports', 'stores', from, to],
    queryFn: () => apiFetch<StoreRankingItem[]>(`/reports/lojas-ranking${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const dreQuery = useQuery({
    queryKey: ['reports', 'dre', from, to],
    queryFn: () => apiFetch<DreSummary>(`/reports/dre${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const summary = summaryQuery.data;
  const dre = dreQuery.data;

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>

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
          {summary ? `Período exibido: ${summary.from} a ${summary.to}` : 'Sem filtro, mostra os últimos 30 dias.'}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Receipt className="h-3.5 w-3.5" />
            Vendas no período
          </div>
          <p className="text-lg font-semibold">{summary ? summary.totalSales : '—'}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Wallet className="h-3.5 w-3.5" />
            Faturamento
          </div>
          <p className="text-lg font-semibold">{summary ? formatCentsToBRL(summary.totalRevenueCents) : '—'}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <BarChart3 className="h-3.5 w-3.5" />
            Ticket médio
          </div>
          <p className="text-lg font-semibold">{summary ? formatCentsToBRL(summary.averageTicketCents) : '—'}</p>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <Trophy className="h-3.5 w-3.5" />
          Ranking de vendedores
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!sellersQuery.data ? (
            <SkeletonRows rows={2} cols={3} />
          ) : sellersQuery.data.length === 0 ? (
            <EmptyState icon={Trophy} message="Nenhuma venda no período." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium">Vendas</th>
                  <th className="px-4 py-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {sellersQuery.data.map((seller) => (
                  <tr key={seller.sellerId} className="border-t border-border">
                    <td className="px-4 py-2">{seller.sellerName}</td>
                    <td className="px-4 py-2">{seller.totalSales}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(seller.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <Store className="h-3.5 w-3.5" />
          Visão consolidada por loja
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!storesQuery.data ? (
            <SkeletonRows rows={2} cols={3} />
          ) : storesQuery.data.length === 0 ? (
            <EmptyState icon={Store} message="Nenhuma venda no período." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Loja</th>
                  <th className="px-4 py-2 font-medium">Vendas</th>
                  <th className="px-4 py-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {storesQuery.data.map((store) => (
                  <tr key={store.storeId} className="border-t border-border">
                    <td className="px-4 py-2">{store.storeName}</td>
                    <td className="px-4 py-2">{store.totalSales}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(store.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">Curva ABC de produtos</h2>
        <p className="text-xs text-muted">
          Classe A cobre até 80% da receita acumulada, B até 95%, C o restante — ajuda a enxergar os produtos que
          mais sustentam o faturamento.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!abcQuery.data ? (
            <SkeletonRows rows={4} cols={5} />
          ) : abcQuery.data.length === 0 ? (
            <EmptyState icon={BarChart3} message="Nenhuma venda no período." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Qtd. vendida</th>
                  <th className="px-4 py-2 font-medium">Receita</th>
                  <th className="px-4 py-2 font-medium">% da receita</th>
                  <th className="px-4 py-2 font-medium">Classe</th>
                </tr>
              </thead>
              <tbody>
                {abcQuery.data.map((item) => (
                  <tr key={item.productId} className="border-t border-border">
                    <td className="px-4 py-2">{item.productName}</td>
                    <td className="px-4 py-2">{item.quantitySold}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(item.revenueCents)}</td>
                    <td className="px-4 py-2 text-muted">{item.revenueSharePercent.toFixed(1)}%</td>
                    <td className="px-4 py-2">
                      <Badge variant={ABC_BADGE_VARIANT[item.class]}>{item.class}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <Landmark className="h-3.5 w-3.5" />
          DRE simplificado
        </h2>
        <p className="text-xs text-muted">
          Regime de caixa: só considera contas já pagas no período, não o que está apenas lançado.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-1">
            <p className="text-xs text-muted">Receitas realizadas</p>
            <p className="text-lg font-semibold text-green-600">{dre ? formatCentsToBRL(dre.receitasCents) : '—'}</p>
          </Card>
          <Card className="flex flex-col gap-1">
            <p className="text-xs text-muted">Despesas realizadas</p>
            <p className="text-lg font-semibold text-red-600">{dre ? formatCentsToBRL(dre.despesasCents) : '—'}</p>
          </Card>
          <Card className="flex flex-col gap-1">
            <p className="text-xs text-muted">Resultado</p>
            <p className={`text-lg font-semibold ${dre && dre.resultadoCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {dre ? formatCentsToBRL(dre.resultadoCents) : '—'}
            </p>
          </Card>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          {!dre ? (
            <SkeletonRows rows={3} cols={4} />
          ) : dre.porCentroDeCusto.length === 0 ? (
            <EmptyState icon={Landmark} message="Nenhuma conta paga no período." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Centro de custo</th>
                  <th className="px-4 py-2 font-medium">Receitas</th>
                  <th className="px-4 py-2 font-medium">Despesas</th>
                  <th className="px-4 py-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {dre.porCentroDeCusto.map((bucket) => (
                  <tr key={bucket.costCenterId ?? 'sem-centro-de-custo'} className="border-t border-border">
                    <td className="px-4 py-2">{bucket.costCenterName}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(bucket.receitasCents)}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(bucket.despesasCents)}</td>
                    <td className={`px-4 py-2 ${bucket.resultadoCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCentsToBRL(bucket.resultadoCents)}
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
