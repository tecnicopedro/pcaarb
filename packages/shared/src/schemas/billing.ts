import { z } from 'zod';

// Plan catalog — single source of truth shared between API and frontend,
// so the displayed price and the charged price never diverge. See
// PRECOS-E-CUSTOS.md for the market rationale behind these numbers.
// 'enterprise' has no priceCents: it's "contact us", not subscribable via
// self-service checkout (subscribeInputSchema excludes this value below).
export const SUBSCRIPTION_PLAN_CATALOG = {
  starter: {
    label: 'Starter',
    priceCents: 11_900,
    description: 'Loja única, 1 caixa — cadastros, PDV, estoque básico, financeiro básico, 1 admin + 1 operador.',
  },
  profissional: {
    label: 'Profissional',
    priceCents: 24_900,
    description:
      'Tudo do Starter + compras, inventário, centro de custo/DRE, relatórios/BI, fidelidade, comissão de vendedores, usuários ilimitados.',
  },
  multi_loja: {
    label: 'Multi-loja',
    priceCents: 34_900,
    description: 'Tudo do Profissional + visão consolidada multi-loja (mais R$99/loja adicional).',
  },
} as const;

export const subscribablePlanSchema = z.enum(['starter', 'profissional', 'multi_loja']);
export type SubscribablePlan = z.infer<typeof subscribablePlanSchema>;

export const subscriptionPlanSchema = z.enum(['starter', 'profissional', 'multi_loja', 'enterprise']);
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;

export const subscriptionStatusSchema = z.enum(['active', 'past_due', 'canceled']);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  plan: subscriptionPlanSchema,
  status: subscriptionStatusSchema,
  priceCents: z.number().int().nonnegative(),
  currentPeriodStart: z.string().datetime(),
  currentPeriodEnd: z.string().datetime(),
  pastDueSince: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Subscription = z.infer<typeof subscriptionSchema>;

export const subscribeInputSchema = z.object({
  plan: subscribablePlanSchema,
});

export type SubscribeInput = z.infer<typeof subscribeInputSchema>;

export const invoiceStatusSchema = z.enum(['paid', 'failed']);

export const subscriptionInvoiceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  amountCents: z.number().int().nonnegative(),
  status: invoiceStatusSchema,
  providerChargeId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type SubscriptionInvoice = z.infer<typeof subscriptionInvoiceSchema>;
