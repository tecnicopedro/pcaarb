import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createStockCountSchema,
  updateStockCountItemSchema,
  type CreateStockCountInput,
  type JwtPayload,
  type UpdateStockCountItemInput,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StockCountsService } from './stock-counts.service';

@ApiTags('stock-counts')
@ApiBearerAuth()
@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly stockCountsService: StockCountsService) {}

  @CheckAbilities({ action: 'read', subject: 'StockCount' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.stockCountsService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'read', subject: 'StockCount' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.stockCountsService.findByIdOrThrow(user.tenantId, id);
  }

  @CheckAbilities({ action: 'create', subject: 'StockCount' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createStockCountSchema)) body: CreateStockCountInput,
  ) {
    return this.stockCountsService.create(user.tenantId, user.sub, body);
  }

  @CheckAbilities({ action: 'update', subject: 'StockCount' })
  @Patch(':id/items/:itemId')
  setItemCount(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateStockCountItemSchema)) body: UpdateStockCountItemInput,
  ) {
    return this.stockCountsService.setItemCount(user.tenantId, id, itemId, body);
  }

  @CheckAbilities({ action: 'update', subject: 'StockCount' })
  @Post(':id/finalize')
  finalize(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.stockCountsService.finalize(user.tenantId, user.sub, id);
  }

  @CheckAbilities({ action: 'update', subject: 'StockCount' })
  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.stockCountsService.cancel(user.tenantId, id);
  }
}
