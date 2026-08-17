import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { FiscalIssueParams, FiscalIssueResult, FiscalProvider } from './fiscal-provider.interface';

/**
 * Adapter de sandbox: sempre autoriza e gera uma chave de acesso no formato
 * de 44 dígitos (mesmo shape de uma chave de NFC-e real). Fica no lugar do
 * adapter real (Focus NFe/PlugNotas/eNotas) até termos conta e certificado
 * digital com um parceiro — ver docs/03-build-vs-buy-pagamentos-fiscal.md.
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
}
