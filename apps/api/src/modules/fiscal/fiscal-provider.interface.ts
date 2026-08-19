export const FISCAL_PROVIDER = Symbol('FISCAL_PROVIDER');

export interface FiscalIssueItem {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface FiscalIssueParams {
  tenantId: string;
  saleId: string;
  totalCents: number;
  items: FiscalIssueItem[];
}

export interface FiscalIssueResult {
  authorized: boolean;
  accessKey?: string;
  documentUrl?: string;
  rejectionReason?: string;
}

export interface FiscalCancelParams {
  tenantId: string;
  saleId: string;
  accessKey: string;
}

export interface FiscalCancelResult {
  canceled: boolean;
  rejectionReason?: string;
}

/**
 * Interface do emissor fiscal (NFC-e) — ver docs/03. O resto do sistema fala
 * só com esta interface; trocar de provedor (Focus NFe, PlugNotas, eNotas...)
 * é escrever um novo adapter, não reescrever o fluxo de venda.
 */
export interface FiscalProvider {
  issueNFCe(params: FiscalIssueParams): Promise<FiscalIssueResult>;
  cancelNFCe(params: FiscalCancelParams): Promise<FiscalCancelResult>;
}
