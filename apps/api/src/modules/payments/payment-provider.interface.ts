import type { PaymentMethod } from '@pcaarb/shared';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface PaymentChargeParams {
  tenantId: string;
  saleId: string | null;
  method: Exclude<PaymentMethod, 'dinheiro'>;
  amountCents: number;
}

export interface PaymentChargeResult {
  approved: boolean;
  providerTransactionId: string;
  declineReason?: string;
}

/**
 * Interface do gateway de pagamento (cartão/Pix) — ver docs/03. O resto do
 * sistema fala só com esta interface; trocar de gateway (Pagar.me, Mercado
 * Pago...) é escrever um novo adapter, não reescrever o SalesService.
 */
export interface PaymentProvider {
  charge(params: PaymentChargeParams): Promise<PaymentChargeResult>;
}
