import { Module } from '@nestjs/common';
import { FISCAL_PROVIDER } from './fiscal-provider.interface';
import { MockFiscalProvider } from './mock-fiscal.provider';
import { FiscalService } from './fiscal.service';

@Module({
  providers: [{ provide: FISCAL_PROVIDER, useClass: MockFiscalProvider }, FiscalService],
  exports: [FiscalService],
})
export class FiscalModule {}
