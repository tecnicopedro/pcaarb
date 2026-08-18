'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, FileText, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  SUBSCRIPTION_PLAN_CATALOG,
  type SubscribablePlan,
  type Subscription,
  type SubscriptionInvoice,
} from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

const PLAN_ORDER: SubscribablePlan[] = ['starter', 'profissional', 'multi_loja'];

const STATUS_BADGE: Record<Subscription['status'], { label: string; variant: BadgeVariant }> = {
  active: { label: 'Ativa', variant: 'success' },
  past_due: { label: 'Pagamento pendente', variant: 'warning' },
  canceled: { label: 'Cancelada', variant: 'danger' },
};

function daysUntil(dateIso: string): number {
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function AssinaturaPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const queryClient = useQueryClient();
  const canManage = meQuery.data?.user.role === 'owner';

  const subscriptionQuery = useQuery({
    queryKey: ['billing', 'subscription'],
    // 404 aqui não é erro de verdade, é o estado normal de quem ainda não
    // assinou (só trial) — tratado como "sem assinatura" em vez de deixar o
    // react-query cair em retry/erro pra um caso totalmente esperado.
    queryFn: async () => {
      try {
        return await apiFetch<Subscription>('/billing/subscription', { accessToken: accessToken! });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!accessToken,
  });

  const invoicesQuery = useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: () => apiFetch<SubscriptionInvoice[]>('/billing/invoices', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['billing'] });
    queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
  }

  const subscribeMutation = useMutation({
    mutationFn: (plan: SubscribablePlan) => apiFetch<Subscription>('/billing/subscribe', { method: 'POST', accessToken: accessToken!, body: { plan } }),
    onSuccess: (_, plan) => {
      invalidateAll();
      toast.success(`Assinatura do plano ${SUBSCRIPTION_PLAN_CATALOG[plan].label} confirmada`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao processar assinatura');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch('/billing/cancel', { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Assinatura cancelada');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Erro ao cancelar assinatura');
    },
  });

  if (!accessToken || subscriptionQuery.isLoading) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Assinatura</h1>
        <Card className="flex flex-col gap-4">
          <SkeletonRows rows={2} cols={1} />
        </Card>
      </>
    );
  }

  const subscription = subscriptionQuery.data;
  const tenant = meQuery.data?.tenant;
  const trialing = tenant?.status === 'trial';
  const blocked = tenant?.status === 'blocked';

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Assinatura</h1>

      {trialing && tenant?.trialEndsAt && (
        <Card className="flex items-center gap-3 border-accent/40 bg-accent-soft/40">
          <CreditCard className="h-5 w-5 text-accent" />
          <p className="text-sm">
            Você está no período de teste — {Math.max(daysUntil(tenant.trialEndsAt), 0)} dia(s) restante(s). Assine um
            plano abaixo pra continuar depois que o teste acabar.
          </p>
        </Card>
      )}

      {blocked && (
        <Card className="flex items-center gap-3 border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
          <XCircle className="h-5 w-5 text-red-600" />
          <p className="text-sm">
            Acesso bloqueado por falta de pagamento. Escolha um plano abaixo — a cobrança é feita na hora e o acesso
            volta assim que aprovada.
          </p>
        </Card>
      )}

      {subscription && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Plano atual: {SUBSCRIPTION_PLAN_CATALOG[subscription.plan as SubscribablePlan]?.label ?? subscription.plan}</h2>
            <Badge variant={STATUS_BADGE[subscription.status].variant}>{STATUS_BADGE[subscription.status].label}</Badge>
          </div>
          <p className="text-sm text-muted">
            {formatCentsToBRL(subscription.priceCents)}/mês
            {subscription.status === 'active' &&
              ` — próxima cobrança em ${new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}`}
            {subscription.status === 'past_due' && ' — última cobrança falhou, tentaremos novamente automaticamente'}
          </p>
          {canManage && subscription.status !== 'canceled' && (
            <Button
              variant="danger"
              className="self-start"
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              Cancelar assinatura
            </Button>
          )}
        </Card>
      )}

      {canManage && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">{subscription && subscription.status !== 'canceled' ? 'Trocar de plano' : 'Escolher plano'}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PLAN_ORDER.map((plan) => {
              const catalog = SUBSCRIPTION_PLAN_CATALOG[plan];
              const isCurrent = subscription?.plan === plan && subscription.status !== 'canceled';
              return (
                <Card key={plan} className={`flex flex-col gap-3 ${isCurrent ? 'border-accent ring-1 ring-accent' : ''}`}>
                  <div>
                    <h3 className="font-medium">{catalog.label}</h3>
                    <p className="text-lg font-semibold">{formatCentsToBRL(catalog.priceCents)}<span className="text-xs font-normal text-muted">/mês</span></p>
                  </div>
                  <p className="flex-1 text-xs text-muted">{catalog.description}</p>
                  {isCurrent ? (
                    <div className="flex items-center gap-1.5 text-xs text-accent">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Plano atual
                    </div>
                  ) : (
                    <Button
                      variant={plan === 'profissional' ? 'primary' : 'secondary'}
                      loading={subscribeMutation.isPending}
                      onClick={() => subscribeMutation.mutate(plan)}
                    >
                      {subscription && subscription.status !== 'canceled' ? 'Trocar para este plano' : 'Assinar'}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            {subscription && subscription.status !== 'canceled'
              ? 'Trocar de plano cobra o valor cheio do novo plano na hora e reinicia o ciclo de 30 dias a partir de hoje.'
              : 'Precisa de API pública, SSO ou suporte dedicado? O plano Enterprise é sob consulta — fale com a gente.'}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <FileText className="h-3.5 w-3.5" />
          Histórico de faturas
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!invoicesQuery.data ? (
            <SkeletonRows rows={2} cols={3} />
          ) : invoicesQuery.data.length === 0 ? (
            <EmptyState icon={FileText} message="Nenhuma fatura ainda." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Período</th>
                  <th className="px-4 py-2 font-medium">Valor</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoicesQuery.data.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      {new Date(invoice.periodStart).toLocaleDateString('pt-BR')} – {new Date(invoice.periodEnd).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-2">{formatCentsToBRL(invoice.amountCents)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={invoice.status === 'paid' ? 'success' : 'danger'}>
                        {invoice.status === 'paid' ? 'Paga' : 'Falhou'}
                      </Badge>
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
