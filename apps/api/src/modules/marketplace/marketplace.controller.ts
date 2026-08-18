import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createMarketplaceChannelSchema,
  updateMarketplaceChannelSchema,
  type CreateMarketplaceChannelInput,
  type JwtPayload,
  type UpdateMarketplaceChannelInput,
} from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MarketplaceChannelsService } from './marketplace-channels.service';
import { MarketplaceListingsService } from './marketplace-listings.service';
import { MarketplaceOrdersService } from './marketplace-orders.service';

@ApiTags('marketplace')
@ApiBearerAuth()
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly channelsService: MarketplaceChannelsService,
    private readonly listingsService: MarketplaceListingsService,
    private readonly ordersService: MarketplaceOrdersService,
  ) {}

  @CheckAbilities({ action: 'read', subject: 'Integration' })
  @Get('channels')
  listChannels(@CurrentUser() user: JwtPayload) {
    return this.channelsService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'create', subject: 'Integration' })
  @Post('channels')
  createChannel(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createMarketplaceChannelSchema)) body: CreateMarketplaceChannelInput,
  ) {
    return this.channelsService.create(user.tenantId, body);
  }

  @CheckAbilities({ action: 'update', subject: 'Integration' })
  @Patch('channels/:id')
  updateChannel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMarketplaceChannelSchema)) body: UpdateMarketplaceChannelInput,
  ) {
    return this.channelsService.update(user.tenantId, id, body);
  }

  @CheckAbilities({ action: 'read', subject: 'Integration' })
  @Get('channels/:id/listings')
  listListings(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.listingsService.listForChannel(user.tenantId, id);
  }

  @CheckAbilities({ action: 'update', subject: 'Integration' })
  @Post('channels/:id/listings/:productId/sync')
  syncListing(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.listingsService.syncProduct(user.tenantId, id, productId);
  }

  @CheckAbilities({ action: 'read', subject: 'Integration' })
  @Get('channels/:id/orders')
  listOrders(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.listForChannel(user.tenantId, id);
  }

  @CheckAbilities({ action: 'update', subject: 'Integration' })
  @Post('channels/:id/orders/pull')
  pullOrders(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.pullOrders(user.tenantId, user.sub, id);
  }
}
