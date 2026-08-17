import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { StockCountsController } from './stock-counts.controller';
import { StockCountsService } from './stock-counts.service';

@Module({
  imports: [StockModule],
  controllers: [StockCountsController],
  providers: [StockCountsService],
})
export class StockCountsModule {}
