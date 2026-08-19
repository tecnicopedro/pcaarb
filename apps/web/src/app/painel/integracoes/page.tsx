'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Key, PackageSearch, Plug, RefreshCw, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ApiKey,
  CreatedApiKey,
  MarketplaceChannel,
  MarketplaceListingWithProduct,
  MarketplaceOrder,
  Product,
  PullMarketplaceOrdersResult,
  Role,
} from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { ROLE_LABELS } from '@/lib/role-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

const API_KEY_ROLES: Role[] = ['owner', 'admin', 'financeiro', 'operador_caixa'];

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

  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRole, setNewKeyRole] = useState<Role>('admin');
  const [newKeyExpiresAt, setNewKeyExpiresAt] = useState('');
  const [justCreatedKey, setJustCreatedKey] = useState<CreatedApiKey | null>(null);

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

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiFetch<ApiKey[]>('/api-keys', { accessToken: accessToken! }),
    enabled: !!accessToken,
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

  const createApiKeyMutation = useMutation({
    mutationFn: () =>
      apiFetch<CreatedApiKey>('/api-keys', {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          name: newKeyName,
          role: newKeyRole,
          // Input type="date" only gives the date — it expires at the end of the chosen day.
          expiresAt: newKeyExpiresAt ? new Date(`${newKeyExpiresAt}T23:59:59`).toISOString() : undefined,
        },
      }),
    onSuccess: (created) => {
      setJustCreatedKey(created);
      setNewKeyName('');
      setNewKeyRole('admin');
      setNewKeyExpiresAt('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao criar chave de API');
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api-keys/${id}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('Chave de API revogada');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao revogar chave de API');
    },
  });

  async function copyRawKey(rawKey: string) {
    try {
      await navigator.clipboard.writeText(rawKey);
      toast.success('Chave copiada');
    } catch {
      toast.error('Não foi possível copiar automaticamente — selecione e copie manualmente');
    }
  }

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

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            <Key className="h-4 w-4" />
            Chaves de API
          </h2>
          <p className="text-sm text-muted">
            Gere uma chave pra um sistema externo consumir a API do PCAARB diretamente (documentação interativa em{' '}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">/api/docs</code>). A chave age com as
            mesmas permissões do papel escolhido — as mesmas regras que valem pra um usuário logado. Use só em servidor —
            nunca em código que roda no navegador do cliente final.
          </p>
        </div>

        {justCreatedKey && (
          <Card className="flex flex-col gap-2 border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Guarde esta chave agora — ela não será exibida de novo.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border border-amber-300 bg-white px-3 py-2 text-xs dark:border-amber-800 dark:bg-zinc-950">
                {justCreatedKey.rawKey}
              </code>
              <Button variant="secondary" onClick={() => copyRawKey(justCreatedKey.rawKey)}>
                <Copy className="h-4 w-4" />
                Copiar
              </Button>
            </div>
            <button
              type="button"
              className="self-start text-xs text-muted hover:underline"
              onClick={() => setJustCreatedKey(null)}
            >
              Já guardei, fechar
            </button>
          </Card>
        )}

        <Card className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-40 flex-1 flex-col gap-1.5">
            <label className="text-sm">Nome</label>
            <Input placeholder="Ex.: Integração contábil" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Papel</label>
            <select
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
              value={newKeyRole}
              onChange={(e) => setNewKeyRole(e.target.value as Role)}
            >
              {API_KEY_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Expira em (opcional)</label>
            <input
              type="date"
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
              value={newKeyExpiresAt}
              onChange={(e) => setNewKeyExpiresAt(e.target.value)}
            />
          </div>
          <Button loading={createApiKeyMutation.isPending} disabled={!newKeyName} onClick={() => createApiKeyMutation.mutate()}>
            Gerar chave
          </Button>
        </Card>

        <div className="overflow-x-auto rounded-lg border border-border">
          {!apiKeysQuery.data ? (
            <SkeletonRows rows={2} cols={4} />
          ) : apiKeysQuery.data.length === 0 ? (
            <EmptyState icon={Key} message="Nenhuma chave de API criada ainda." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Chave</th>
                  <th className="px-4 py-2 font-medium">Papel</th>
                  <th className="px-4 py-2 font-medium">Último uso</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {apiKeysQuery.data.map((key) => {
                  const expired = key.expiresAt && new Date(key.expiresAt) < new Date();
                  return (
                    <tr key={key.id} className="border-t border-border">
                      <td className="px-4 py-2">{key.name}</td>
                      <td className="px-4 py-2">
                        <code className="text-xs text-muted">{key.keyPrefix}…</code>
                      </td>
                      <td className="px-4 py-2">{ROLE_LABELS[key.role]}</td>
                      <td className="px-4 py-2 text-muted">
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('pt-BR') : 'Nunca usada'}
                      </td>
                      <td className="px-4 py-2">
                        {key.revokedAt ? (
                          <Badge variant="neutral">Revogada</Badge>
                        ) : expired ? (
                          <Badge variant="warning">Expirada</Badge>
                        ) : (
                          <Badge variant="success">Ativa</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!key.revokedAt && (
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            disabled={revokeApiKeyMutation.isPending}
                            onClick={() => revokeApiKeyMutation.mutate(key.id)}
                          >
                            Revogar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
