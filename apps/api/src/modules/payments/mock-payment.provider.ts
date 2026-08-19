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
 * Adapter de sandbox: sempre aprova. Fica no lugar do adapter real
 * (Pagar.me/Mercado Pago) até termos conta e credenciais com um parceiro —
 * ver docs/03-build-vs-buy-pagamentos-fiscal.md. Nenhum dado de cartão passa
 * por aqui; a integração real delegaria isso ao SDK do gateway.
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
