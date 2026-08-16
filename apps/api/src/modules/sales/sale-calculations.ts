export interface SaleLine {
  priceCents: number;
  quantity: number;
}

export interface SaleTotals {
  subtotalCents: number;
  totalCents: number;
}

/**
 * Cálculo puro, sem dependência de banco/HTTP — mantém a regra de negócio
 * mais sensível a dinheiro do sistema testável isoladamente e barata de
 * revisar. Todo valor em centavos (inteiro), nunca float.
 */
export function calculateSaleTotals(lines: SaleLine[], discountCents: number): SaleTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  const totalCents = subtotalCents - discountCents;
  return { subtotalCents, totalCents };
}

export function sumPaymentsCents(payments: { amountCents: number }[]): number {
  return payments.reduce((sum, payment) => sum + payment.amountCents, 0);
}
