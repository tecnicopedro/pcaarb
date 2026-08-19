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

export interface PaymentRefundParams {
  tenantId: string;
  saleId: string;
  method: Exclude<PaymentMethod, 'dinheiro'>;
  amountCents: number;
  providerTransactionId: string;
}

export interface PaymentRefundResult {
  approved: boolean;
  providerRefundId: string;
  declineReason?: string;
}

/**
 * Payment gateway (card/Pix) interface — see docs/03. The rest of the system
 * talks only to this interface; switching gateways (Pagar.me, Mercado
 * Pago...) is writing a new adapter, not rewriting SalesService.
 */
export interface PaymentProvider {
  charge(params: PaymentChargeParams): Promise<PaymentChargeResult>;
  refund(params: PaymentRefundParams): Promise<PaymentRefundResult>;
}
