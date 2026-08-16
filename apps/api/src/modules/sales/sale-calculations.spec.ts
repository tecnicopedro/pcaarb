import { describe, expect, it } from 'vitest';
import { calculateSaleTotals, sumPaymentsCents } from './sale-calculations';

describe('calculateSaleTotals', () => {
  it('soma preço x quantidade de cada linha para o subtotal', () => {
    const totals = calculateSaleTotals(
      [
        { priceCents: 899, quantity: 2 },
        { priceCents: 500, quantity: 1 },
      ],
      0,
    );
    expect(totals.subtotalCents).toBe(2298);
    expect(totals.totalCents).toBe(2298);
  });

  it('aplica desconto sobre o subtotal', () => {
    const totals = calculateSaleTotals([{ priceCents: 1000, quantity: 1 }], 150);
    expect(totals.subtotalCents).toBe(1000);
    expect(totals.totalCents).toBe(850);
  });

  it('desconto maior que o subtotal resulta em total negativo (quem chama decide se rejeita)', () => {
    const totals = calculateSaleTotals([{ priceCents: 100, quantity: 1 }], 200);
    expect(totals.totalCents).toBe(-100);
  });

  it('carrinho vazio soma zero', () => {
    expect(calculateSaleTotals([], 0).subtotalCents).toBe(0);
  });
});

describe('sumPaymentsCents', () => {
  it('soma o valor de múltiplas formas de pagamento (split payment)', () => {
    expect(
      sumPaymentsCents([
        { amountCents: 500 },
        { amountCents: 799 },
      ]),
    ).toBe(1299);
  });

  it('sem pagamentos soma zero', () => {
    expect(sumPaymentsCents([])).toBe(0);
  });
});
