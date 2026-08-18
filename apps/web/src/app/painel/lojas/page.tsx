'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Store as StoreIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Store } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonRows } from '@/components/ui/skeleton';

export default function LojasPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const canManage = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';
  const queryClient = useQueryClient();
  const [newStoreName, setNewStoreName] = useState('');

  const storesQuery = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiFetch<Store[]>('/stores', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['stores'] });
  }

  const createMutation = useMutation({
    mutationFn: () => apiFetch<Store>('/stores', { method: 'POST', accessToken: accessToken!, body: { name: newStoreName } }),
    onSuccess: () => {
      setNewStoreName('');
      invalidate();
      toast.success('Loja criada');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao criar loja');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<Store>(`/stores/${id}`, { method: 'PATCH', accessToken: accessToken!, body: { active } }),
    onSuccess: () => {
      invalidate();
      toast.success('Loja atualizada');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao atualizar loja');
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Lojas</h1>

      {canManage && (
        <Card className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm">Nova loja</label>
            <Input placeholder="Nome da loja" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} />
          </div>
          <Button loading={createMutation.isPending} disabled={!newStoreName} onClick={() => createMutation.mutate()}>
            Adicionar
          </Button>
        </Card>
      )}
      <p className="text-xs text-muted">Operar mais de uma loja exige o plano Multi-loja — ver /painel/assinatura.</p>

      <div className="overflow-x-auto rounded-lg border border-border">
        {!storesQuery.data ? (
          <SkeletonRows rows={2} cols={2} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Loja</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {canManage && <th className="px-4 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {storesQuery.data.map((store) => (
                <tr key={store.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5">
                      <StoreIcon className="h-3.5 w-3.5 text-muted" />
                      {store.name}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={store.active ? 'success' : 'neutral'}>{store.active ? 'Ativa' : 'Inativa'}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-accent hover:underline"
                        disabled={toggleActiveMutation.isPending}
                        onClick={() => toggleActiveMutation.mutate({ id: store.id, active: !store.active })}
                      >
                        {store.active ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
