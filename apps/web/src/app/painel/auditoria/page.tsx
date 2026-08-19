'use client';

import { useQuery } from '@tanstack/react-query';
import { Lock, ScrollText } from 'lucide-react';
import type { AuditLog, User } from '@pcaarb/shared';
import { apiFetch } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

const ACTION_LABELS: Record<string, string> = {
  'user.role_updated': 'Papel de usuário alterado',
  'permission_override.granted': 'Exceção de permissão concedida',
  'permission_override.revoked': 'Exceção de permissão revogada',
  'billing.subscribed': 'Assinatura contratada',
  'billing.canceled': 'Assinatura cancelada',
  'sale_return.created': 'Devolução de venda registrada',
  'auth.password_reset': 'Senha redefinida',
  'auth.account_locked': 'Conta bloqueada por tentativas de login',
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function AuditoriaPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  // GET /audit-logs é owner-only no backend (subject CASL 'AuditLog',
  // deliberadamente fora de permissionSubjectSchema — ver ability.factory.ts)
  // — sem esse gate aqui, qualquer outro papel navegando pra essa página
  // ficaria vendo a consulta falhar com 403 sem nenhuma explicação.
  const canView = meQuery.data?.user.role === 'owner';

  const logsQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiFetch<AuditLog[]>('/audit-logs', { accessToken: accessToken! }),
    enabled: !!accessToken && canView,
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<User[]>('/users', { accessToken: accessToken! }),
    enabled: !!accessToken && canView,
  });

  if (!accessToken || !meQuery.data) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <Card>
          <SkeletonRows rows={5} cols={4} />
        </Card>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <Card>
          <EmptyState icon={Lock} message="Só o dono da loja vê o log de auditoria." />
        </Card>
      </>
    );
  }

  const actorName = (actorUserId: string | null) => {
    if (!actorUserId) return 'Sistema';
    return usersQuery.data?.find((u) => u.id === actorUserId)?.name ?? '—';
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
      <p className="text-sm text-muted">Ações sensíveis do tenant — troca de papel, permissões, assinatura, devoluções, senha e bloqueio de conta.</p>

      <div className="overflow-x-auto rounded-lg border border-border">
        {!logsQuery.data ? (
          <SkeletonRows rows={8} cols={4} />
        ) : logsQuery.data.length === 0 ? (
          <EmptyState icon={ScrollText} message="Nenhuma ação registrada ainda." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Ação</th>
                <th className="px-4 py-2 font-medium">Autor</th>
                <th className="px-4 py-2 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logsQuery.data.map((log) => (
                <tr key={log.id} className="border-t border-border">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-2">{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td className="px-4 py-2">{actorName(log.actorUserId)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">
                    {log.metadata ? JSON.stringify(log.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
