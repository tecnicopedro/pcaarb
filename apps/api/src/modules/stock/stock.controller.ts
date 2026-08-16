import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createStockMovementSchema,
  type CreateStockMovementInput,
  type JwtPayload,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StockService } from './stock.service';

@ApiTags('stock')
@ApiBearerAuth()
@Controller('products/:productId/stock-movements')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @CheckAbilities({ action: 'create', subject: 'StockMovement' })
  @Post()
  createMovement(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(createStockMovementSchema)) body: CreateStockMovementInput,
  ) {
    return this.stockService.createMovement(user.tenantId, user.sub, productId, body);
  }

  @CheckAbilities({ action: 'read', subject: 'StockMovement' })
  @Get()
  listMovements(@CurrentUser() user: JwtPayload, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.stockService.listMovements(user.tenantId, productId);
  }
}
