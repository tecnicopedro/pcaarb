// Generates CSV compatible with Excel/spreadsheets (UTF-8 BOM + ";" separator,
// the pattern that Excel in pt-BR expects; comma as field separator breaks in
// any Brazilian regional configuration).
const BOM = '﻿';

// Fields like a finance entry description or customer/supplier name are
// free text entered by a tenant user — if one contains a value starting
// with =, +, -, @, tab or CR, Excel/Sheets may interpret it as a formula
// when opening the spreadsheet (CSV injection). Prefixing with a single
// quote neutralizes it without changing the visible value (Excel treats
// it as "force text").
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function escapeField(value: string | number): string {
  let str = String(value);
  if (FORMULA_TRIGGER.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(header: string[], rows: Array<Array<string | number>>): string {
  const lines = [header, ...rows].map((row) => row.map(escapeField).join(';'));
  return BOM + lines.join('\r\n') + '\r\n';
}
