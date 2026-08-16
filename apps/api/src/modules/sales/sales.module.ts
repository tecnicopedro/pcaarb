import { Module } from '@nestjs/common';
import { CashSessionsModule } from '../cash-sessions/cash-sessions.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [CashSessionsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
