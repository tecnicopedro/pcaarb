// Gera CSV compatível com Excel/planilhas (BOM UTF-8 + separador ";", padrão
// que o Excel em pt-BR espera; vírgula como separador de campo quebra em
// qualquer configuração regional brasileira).
const BOM = '﻿';

// Campos como descrição de conta financeira ou nome de cliente/fornecedor são
// texto livre cadastrado por usuário do tenant — se algum contiver um valor
// começando com =, +, -, @, tab ou CR, Excel/Sheets pode interpretar como
// fórmula ao abrir a planilha (CSV injection). Prefixo com aspas simples
// neutraliza sem alterar o valor visível (Excel trata como "forçar texto").
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
