import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CashSessionsModule } from '../cash-sessions/cash-sessions.module';
import { StockModule } from '../stock/stock.module';
import { PaymentsModule } from '../payments/payments.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SaleReturnsForSaleController, SaleReturnsController } from './sale-returns.controller';
import { SaleReturnsService } from './sale-returns.service';

@Module({
  imports: [CashSessionsModule, StockModule, PaymentsModule, FiscalModule, LoyaltyModule, AuditLogModule],
  controllers: [SalesController, SaleReturnsForSaleController, SaleReturnsController],
  providers: [SalesService, SaleReturnsService],
  exports: [SalesService, SaleReturnsService],
})
export class SalesModule {}
