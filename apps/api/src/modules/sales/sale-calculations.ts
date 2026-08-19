export interface SaleLine {
  priceCents: number;
  quantity: number;
}

export interface SaleTotals {
  subtotalCents: number;
  totalCents: number;
}

/**
 * Pure calculation, no database/HTTP dependency — keeps the system's most
 * money-sensitive business rule independently testable and cheap to review.
 * Every value in cents (integer), never a float.
 */
export function calculateSaleTotals(lines: SaleLine[], discountCents: number, redemptionValueCents = 0): SaleTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  const totalCents = subtotalCents - discountCents - redemptionValueCents;
  return { subtotalCents, totalCents };
}

/**
 * Points earned are calculated on the total actually paid in money (already
 * net of discount and redemption) — never on the gross subtotal. This way a
 * redemption doesn't "recycle" points: spending points doesn't generate more
 * points on the part they themselves paid for.
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
