'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, BarChart3, Download, Landmark, PackageSearch, Receipt, Store, Tag, Trophy, Wallet } from 'lucide-react';
import type {
  AbcCurveItem,
  DreSummary,
  PricingSuggestionItem,
  ReorderSuggestionItem,
  SalesSummary,
  SellerRankingItem,
  StoreRankingItem,
} from '@pcaarb/shared';
import { apiFetch, apiDownload, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const [exporting, setExporting] = useState<'vendas' | 'financeiro' | null>(null);
  const [targetMarginPercent, setTargetMarginPercent] = useState('30');
  const period = buildPeriodQuery(from, to);

  async function handleExport(kind: 'vendas' | 'financeiro') {
    if (!accessToken) return;
    setExporting(kind);
    try {
      await apiDownload(`/reports/exportar/${kind}.csv${period}`, accessToken);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao gerar o arquivo');
    } finally {
      setExporting(null);
    }
  }

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

  const reorderQuery = useQuery({
    queryKey: ['reports', 'reposicao', from, to],
    queryFn: () => apiFetch<ReorderSuggestionItem[]>(`/reports/reposicao${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const marginNumber = Number(targetMarginPercent);
  const pricingQuery = useQuery({
    queryKey: ['reports', 'precificacao', marginNumber],
    queryFn: () =>
      apiFetch<PricingSuggestionItem[]>(`/reports/precificacao?targetMarginPercent=${marginNumber}`, {
        accessToken: accessToken!,
      }),
    enabled: !!accessToken && Number.isFinite(marginNumber) && marginNumber >= 0 && marginNumber <= 95,
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
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            loading={exporting === 'vendas'}
            onClick={() => handleExport('vendas')}
          >
            <Download className="h-4 w-4" />
            Exportar vendas
          </Button>
          <Button
            variant="secondary"
            loading={exporting === 'financeiro'}
            onClick={() => handleExport('financeiro')}
          >
            <Download className="h-4 w-4" />
            Exportar financeiro
          </Button>
        </div>
      </Card>
      <p className="-mt-2 text-xs text-muted">
        Exporta em CSV (compatível com Excel/Google Sheets) para enviar ao contador ou abrir em qualquer planilha.
      </p>

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
          <PackageSearch className="h-3.5 w-3.5" />
          Sugestão de reposição de estoque
        </h2>
        <p className="text-xs text-muted">
          Estimativa por média móvel simples (venda no período ÷ dias do período) — não é um modelo de previsão com
          sazonalidade, é uma projeção linear sobre o que já foi vendido. Produtos sem histórico de venda e com
          estoque saudável não aparecem aqui.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!reorderQuery.data ? (
            <SkeletonRows rows={3} cols={5} />
          ) : reorderQuery.data.length === 0 ? (
            <EmptyState icon={PackageSearch} message="Nenhum produto precisa de atenção no momento." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Estoque</th>
                  <th className="px-4 py-2 font-medium">Vendas/dia (média)</th>
                  <th className="px-4 py-2 font-medium">Previsão de esgotar</th>
                  <th className="px-4 py-2 font-medium">Sugestão de compra</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {reorderQuery.data.map((item) => (
                  <tr key={item.productId} className="border-t border-border">
                    <td className="px-4 py-2">{item.productName}</td>
                    <td className="px-4 py-2">{item.stockQuantity}</td>
                    <td className="px-4 py-2 text-muted">{item.avgDailySales.toFixed(2)}</td>
                    <td className="px-4 py-2 text-muted">
                      {item.daysUntilStockout === null ? '—' : `${item.daysUntilStockout} dia(s)`}
                    </td>
                    <td className="px-4 py-2">{item.suggestedReorderQty > 0 ? item.suggestedReorderQty : '—'}</td>
                    <td className="px-4 py-2">
                      {item.needsAttention ? (
                        <Badge variant="danger">
                          <AlertTriangle className="mr-1 inline h-3 w-3" />
                          Atenção
                        </Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
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
          <Tag className="h-3.5 w-3.5" />
          Sugestão de precificação
        </h2>
        <p className="text-xs text-muted">
          Preço sugerido pela margem-alvo informada (custo ÷ (1 − margem)) — heurística de margem, não considera
          concorrência ou elasticidade de preço. Só entram produtos com custo cadastrado.
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Margem-alvo</label>
          <Input
            type="number"
            min={0}
            max={95}
            value={targetMarginPercent}
            onChange={(e) => setTargetMarginPercent(e.target.value)}
            className="w-24"
          />
          <span className="text-sm text-muted">%</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!pricingQuery.data ? (
            <SkeletonRows rows={3} cols={5} />
          ) : pricingQuery.data.length === 0 ? (
            <EmptyState icon={Tag} message="Nenhum produto ativo com custo cadastrado." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Preço atual</th>
                  <th className="px-4 py-2 font-medium">Custo</th>
                  <th className="px-4 py-2 font-medium">Margem atual</th>
                  <th className="px-4 py-2 font-medium">Preço sugerido</th>
                </tr>
              </thead>
              <tbody>
                {pricingQuery.data.map((item) => (
                  <tr key={item.productId} className="border-t border-border">
                    <td className="px-4 py-2">{item.productName}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(item.priceCents)}</td>
                    <td className="px-4 py-2 text-muted">{formatCentsToBRL(item.costPriceCents)}</td>
                    <td className="px-4 py-2">
                      {item.belowCost ? (
                        <Badge variant="danger">{item.currentMarginPercent.toFixed(1)}% (abaixo do custo)</Badge>
                      ) : (
                        <span className={item.currentMarginPercent < 15 ? 'text-amber-600' : ''}>
                          {item.currentMarginPercent.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{formatCentsToBRL(item.suggestedPriceCents)}</td>
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
