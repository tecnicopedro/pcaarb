import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  FiscalCancelParams,
  FiscalCancelResult,
  FiscalIssueParams,
  FiscalIssueResult,
  FiscalProvider,
} from './fiscal-provider.interface';

/**
 * Sandbox adapter: always authorizes and generates a 44-digit access key
 * (same shape as a real NFC-e key). Stands in for the real adapter (Focus
 * NFe/PlugNotas/eNotas) until we have an account and digital certificate
 * with a partner — see docs/03-build-vs-buy-pagamentos-fiscal.md.
 */
@Injectable()
export class MockFiscalProvider implements FiscalProvider {
  async issueNFCe(_params: FiscalIssueParams): Promise<FiscalIssueResult> {
    const accessKey = Array.from({ length: 44 }, () => randomInt(0, 10)).join('');
    return {
      authorized: true,
      accessKey,
      documentUrl: `https://fiscal-sandbox.pcaarb.local/nfce/${accessKey}`,
    };
  }

  async cancelNFCe(_params: FiscalCancelParams): Promise<FiscalCancelResult> {
    return { canceled: true };
  }
}
