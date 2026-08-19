import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  PaymentChargeParams,
  PaymentChargeResult,
  PaymentProvider,
  PaymentRefundParams,
  PaymentRefundResult,
} from './payment-provider.interface';

/**
 * Sandbox adapter: always approves. Stands in for the real adapter
 * (Pagar.me/Mercado Pago) until we have an account and credentials with a
 * partner — see docs/03-build-vs-buy-pagamentos-fiscal.md. No card data ever
 * passes through here; the real integration would delegate that to the
 * gateway's SDK.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  async charge(params: PaymentChargeParams): Promise<PaymentChargeResult> {
    return {
      approved: true,
      providerTransactionId: `mock_${params.method}_${randomUUID()}`,
    };
  }

  async refund(params: PaymentRefundParams): Promise<PaymentRefundResult> {
    return {
      approved: true,
      providerRefundId: `mock_refund_${params.method}_${randomUUID()}`,
    };
  }
}
