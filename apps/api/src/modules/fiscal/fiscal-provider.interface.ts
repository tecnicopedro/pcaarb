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
 * Fiscal document issuer (NFC-e) interface — see docs/03. The rest of the
 * system talks only to this interface; switching providers (Focus NFe,
 * PlugNotas, eNotas...) is writing a new adapter, not rewriting the sale
 * flow.
 */
export interface FiscalProvider {
  issueNFCe(params: FiscalIssueParams): Promise<FiscalIssueResult>;
  cancelNFCe(params: FiscalCancelParams): Promise<FiscalCancelResult>;
}
