const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCentsToBRL(cents: number): string {
  return formatter.format(cents / 100);
}

export function parseBRLToCents(value: string): number {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(',', '.');
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}
