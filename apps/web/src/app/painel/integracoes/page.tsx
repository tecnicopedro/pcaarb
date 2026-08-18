'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, PackageSearch, Plug, RefreshCw, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import type {
  MarketplaceChannel,
  MarketplaceListingWithProduct,
  MarketplaceOrder,
  Product,
  PullMarketplaceOrdersResult,
} from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

const LISTING_STATUS_BADGE: Record<'nao_sincronizado' | 'pending' | 'synced' | 'error', { label: string; variant: BadgeVariant }> = {
  nao_sincronizado: { label: 'Não sincronizado', variant: 'neutral' },
  pending: { label: 'Pendente', variant: 'neutral' },
  synced: { label: 'Sincronizado', variant: 'success' },
  error: { label: 'Erro', variant: 'danger' },
};

const ORDER_STATUS_BADGE: Record<MarketplaceOrder['status'], { label: string; variant: BadgeVariant }> = {
  imported: { label: 'Importado', variant: 'success' },
  needs_attention: { label: 'Requer atenção', variant: 'warning' },
};

export default function IntegracoesPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const canManage = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';
  const queryClient = useQueryClient();

  const [newChannelName, setNewChannelName] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const channelsQuery = useQuery({
    queryKey: ['marketplace', 'channels'],
    queryFn: () => apiFetch<MarketplaceChannel[]>('/marketplace/channels', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => apiFetch<Product[]>('/products', { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedChannelId,
  });

  const listingsQuery = useQuery({
    queryKey: ['marketplace', 'listings', selectedChannelId],
    queryFn: () => apiFetch<MarketplaceListingWithProduct[]>(`/marketplace/channels/${selectedChannelId}/listings`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedChannelId,
  });

  const ordersQuery = useQuery({
    queryKey: ['marketplace', 'orders', selectedChannelId],
    queryFn: () => apiFetch<MarketplaceOrder[]>(`/marketplace/channels/${selectedChannelId}/orders`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedChannelId,
  });

  function invalidateChannel() {
    queryClient.invalidateQueries({ queryKey: ['marketplace', 'listings', selectedChannelId] });
    queryClient.invalidateQueries({ queryKey: ['marketplace', 'orders', selectedChannelId] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  }

  const createChannelMutation = useMutation({
    mutationFn: () => apiFetch<MarketplaceChannel>('/marketplace/channels', { method: 'POST', accessToken: accessToken!, body: { name: newChannelName } }),
    onSuccess: (channel) => {
      setNewChannelName('');
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'channels'] });
      setSelectedChannelId(channel.id);
      toast.success('Integração criada (sandbox)');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao criar integração');
    },
  });

  const toggleChannelMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<MarketplaceChannel>(`/marketplace/channels/${id}`, { method: 'PATCH', accessToken: accessToken!, body: { active } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'channels'] });
      toast.success('Integração atualizada');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao atualizar integração');
    },
  });

  const syncProductMutation = useMutation({
    mutationFn: (productId: string) =>
      apiFetch(`/marketplace/channels/${selectedChannelId}/listings/${productId}/sync`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateChannel();
      toast.success('Produto sincronizado');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao sincronizar produto');
    },
  });

  const pullOrdersMutation = useMutation({
    mutationFn: () => apiFetch<PullMarketplaceOrdersResult>(`/marketplace/channels/${selectedChannelId}/orders/pull`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: (result) => {
      invalidateChannel();
      if (result.fetched === 0) {
        toast.success('Nenhum pedido novo no canal');
      } else if (result.needsAttention > 0) {
        toast.error(`${result.imported} pedido(s) importado(s), ${result.needsAttention} precisam de atenção`);
      } else {
        toast.success(`${result.imported} pedido(s) importado(s)`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao buscar pedidos');
    },
  });

  if (!accessToken || meQuery.isLoading) {
    return null;
  }

  if (!canManage) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <Card>
          <p className="text-sm text-muted">Configurar integrações de e-commerce/marketplace é restrito a administradores.</p>
        </Card>
      </>
    );
  }

  const selectedChannel = channelsQuery.data?.find((c) => c.id === selectedChannelId) ?? null;
  const listingByProductId = new Map((listingsQuery.data ?? []).map((listing) => [listing.productId, listing]));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
      <p className="text-sm text-muted">
        Conecte canais de e-commerce/marketplace (sandbox — sem credenciais reais ainda) para publicar produtos e importar
        pedidos, mantendo o estoque consistente entre o PDV e as vendas online.
      </p>

      <Card className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm">Nova integração (sandbox)</label>
          <Input placeholder="Ex.: Loja no Mercado Livre" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} />
        </div>
        <Button loading={createChannelMutation.isPending} disabled={!newChannelName} onClick={() => createChannelMutation.mutate()}>
          Conectar
        </Button>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border">
        {!channelsQuery.data ? (
          <SkeletonRows rows={2} cols={2} />
        ) : channelsQuery.data.length === 0 ? (
          <EmptyState icon={Plug} message="Nenhuma integração conectada ainda." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Canal</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {channelsQuery.data.map((channel) => (
                <tr
                  key={channel.id}
                  className={`cursor-pointer border-t border-border ${selectedChannelId === channel.id ? 'bg-accent-soft/40' : ''}`}
                  onClick={() => setSelectedChannelId(channel.id)}
                >
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5">
                      <Plug className="h-3.5 w-3.5 text-muted" />
                      {channel.name}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={channel.active ? 'success' : 'neutral'}>{channel.active ? 'Ativa' : 'Inativa'}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-accent hover:underline"
                      disabled={toggleChannelMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleChannelMutation.mutate({ id: channel.id, active: !channel.active });
                      }}
                    >
                      {channel.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedChannel && (
        <>
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <PackageSearch className="h-4 w-4" />
                Produtos — {selectedChannel.name}
              </h2>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              {!productsQuery.data || !listingsQuery.data ? (
                <SkeletonRows rows={3} cols={4} />
              ) : productsQuery.data.filter((p) => p.active).length === 0 ? (
                <EmptyState icon={PackageSearch} message="Nenhum produto ativo cadastrado ainda." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-2 font-medium">Produto</th>
                      <th className="px-4 py-2 font-medium">Preço</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsQuery.data
                      .filter((p) => p.active)
                      .map((product) => {
                        const listing = listingByProductId.get(product.id);
                        const statusInfo = LISTING_STATUS_BADGE[listing?.status ?? 'nao_sincronizado'];
                        return (
                          <tr key={product.id} className="border-t border-border">
                            <td className="px-4 py-2">{product.name}</td>
                            <td className="px-4 py-2">{formatCentsToBRL(product.priceCents)}</td>
                            <td className="px-4 py-2">
                              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                              {listing?.status === 'error' && listing.lastSyncError && (
                                <p className="mt-1 text-xs text-red-600">{listing.lastSyncError}</p>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <Button
                                variant="secondary"
                                loading={syncProductMutation.isPending && syncProductMutation.variables === product.id}
                                onClick={() => syncProductMutation.mutate(product.id)}
                              >
                                {listing ? 'Sincronizar novamente' : 'Sincronizar'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <ShoppingBag className="h-4 w-4" />
                Pedidos importados — {selectedChannel.name}
              </h2>
              <Button variant="secondary" loading={pullOrdersMutation.isPending} onClick={() => pullOrdersMutation.mutate()}>
                <RefreshCw className="h-4 w-4" />
                Buscar novos pedidos
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              {!ordersQuery.data ? (
                <SkeletonRows rows={2} cols={3} />
              ) : ordersQuery.data.length === 0 ? (
                <EmptyState icon={ShoppingBag} message="Nenhum pedido importado ainda." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-2 font-medium">Pedido</th>
                      <th className="px-4 py-2 font-medium">Valor</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersQuery.data.map((order) => (
                      <tr key={order.id} className="border-t border-border">
                        <td className="px-4 py-2">{order.externalOrderId}</td>
                        <td className="px-4 py-2">{formatCentsToBRL(order.totalCents)}</td>
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-1.5">
                            <Badge variant={ORDER_STATUS_BADGE[order.status].variant}>{ORDER_STATUS_BADGE[order.status].label}</Badge>
                            {order.status === 'needs_attention' && (
                              <span className="inline-flex" title={order.issue ?? undefined}>
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                              </span>
                            )}
                          </span>
                          {order.status === 'needs_attention' && order.issue && (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">{order.issue}</p>
                          )}
                          {order.status === 'imported' && (
                            <span className="mt-1 flex items-center gap-1 text-xs text-muted">
                              <CheckCircle2 className="h-3 w-3" />
                              estoque atualizado
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
