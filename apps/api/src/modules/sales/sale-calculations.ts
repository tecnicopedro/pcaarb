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
export function calculateSaleTotals(lines: SaleLine[], discountCents: number, redemptionValueCents = 0): SaleTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  const totalCents = subtotalCents - discountCents - redemptionValueCents;
  return { subtotalCents, totalCents };
}

/**
 * Pontos ganhos são calculados sobre o total efetivamente pago em dinheiro
 * (já líquido de desconto e resgate) — nunca sobre o subtotal bruto. Assim
 * um resgate não "recicla" pontos: gastar pontos não gera mais pontos sobre
 * a parte que eles mesmos pagaram.
 */
export function calculatePointsEarned(netPaidCents: number, earnRatePoints: number): number {
  if (netPaidCents <= 0 || earnRatePoints <= 0) {
    return 0;
  }
  return Math.floor(netPaidCents / 100) * earnRatePoints;
}

export function sumPaymentsCents(payments: { amountCents: number }[]): number {
  return payments.reduce((sum, payment) => sum + payment.amountCents, 0);
}
