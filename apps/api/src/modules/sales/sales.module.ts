import { Module } from '@nestjs/common';
import { CashSessionsModule } from '../cash-sessions/cash-sessions.module';
import { StockModule } from '../stock/stock.module';
import { PaymentsModule } from '../payments/payments.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [CashSessionsModule, StockModule, PaymentsModule, FiscalModule, LoyaltyModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
