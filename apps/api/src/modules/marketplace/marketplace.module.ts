import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { MARKETPLACE_PROVIDER } from './marketplace-provider.interface';
import { MockMarketplaceProvider } from './mock-marketplace.provider';
import { MarketplaceChannelsService } from './marketplace-channels.service';
import { MarketplaceListingsService } from './marketplace-listings.service';
import { MarketplaceOrdersService } from './marketplace-orders.service';
import { MarketplaceController } from './marketplace.controller';

@Module({
  imports: [StockModule],
  controllers: [MarketplaceController],
  providers: [
    { provide: MARKETPLACE_PROVIDER, useClass: MockMarketplaceProvider },
    MarketplaceChannelsService,
    MarketplaceListingsService,
    MarketplaceOrdersService,
  ],
  exports: [MarketplaceChannelsService, MarketplaceListingsService, MarketplaceOrdersService],
})
export class MarketplaceModule {}
