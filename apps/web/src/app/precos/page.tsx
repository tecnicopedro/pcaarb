import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { SUBSCRIPTION_PLAN_CATALOG, type SubscribablePlan } from '@pcaarb/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCentsToBRL } from '@/lib/currency';

const PLAN_ORDER: SubscribablePlan[] = ['starter', 'profissional', 'multi_loja'];

const PLAN_FEATURES: Record<SubscribablePlan, string[]> = {
  starter: ['Loja única, 1 caixa', 'Cadastros, PDV, estoque básico', 'Financeiro básico', '1 admin + 1 operador'],
  profissional: [
    'Tudo do Starter',
    'Compras, inventário, centro de custo/DRE',
    'Relatórios e BI',
    'Fidelidade e comissão de vendedores',
    'Usuários ilimitados, permissões granulares',
  ],
  multi_loja: ['Tudo do Profissional', 'Visão consolidada multi-loja', '+ R$99/mês por loja adicional'],
};

export default function PrecosPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-10 bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500">PCAARB</span>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          Preço transparente, sem contrato de implantação
        </h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          14 dias grátis em qualquer plano. Cancele quando quiser, sem multa.
        </p>
      </div>

      <div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
        {PLAN_ORDER.map((plan) => {
          const catalog = SUBSCRIPTION_PLAN_CATALOG[plan];
          const highlighted = plan === 'profissional';
          return (
            <Card
              key={plan}
              className={`flex flex-col gap-4 ${highlighted ? 'border-accent ring-1 ring-accent' : ''}`}
            >
              <div>
                <h2 className="font-medium">{catalog.label}</h2>
                <p className="mt-1 text-3xl font-semibold">
                  {formatCentsToBRL(catalog.priceCents)}
                  <span className="text-sm font-normal text-muted">/mês</span>
                </p>
              </div>
              <ul className="flex flex-1 flex-col gap-2 text-sm text-muted">
                {PLAN_FEATURES[plan].map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/registrar">
                <Button variant={highlighted ? 'primary' : 'secondary'} className="w-full">
                  Começar grátis
                </Button>
              </Link>
            </Card>
          );
        })}
      </div>

      <Card className="flex max-w-xl flex-col items-center gap-2 text-center">
        <h2 className="font-medium">Enterprise</h2>
        <p className="text-sm text-muted">
          Operações grandes, API pública, SSO e suporte dedicado — sob consulta.
        </p>
        <Link href="/registrar">
          <Button variant="ghost">Falar com a gente</Button>
        </Link>
      </Card>
    </main>
  );
}
