import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createSaleReturnSchema, type CreateSaleReturnInput, type JwtPayload } from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SaleReturnsService } from './sale-returns.service';

@ApiTags('sale-returns')
@ApiBearerAuth()
@Controller('sales/:saleId/returns')
export class SaleReturnsForSaleController {
  constructor(private readonly saleReturnsService: SaleReturnsService) {}

  @CheckAbilities({ action: 'create', subject: 'SaleReturn' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body(new ZodValidationPipe(createSaleReturnSchema)) body: CreateSaleReturnInput,
  ) {
    return this.saleReturnsService.create(user.tenantId, user.sub, saleId, body);
  }

  @CheckAbilities({ action: 'read', subject: 'SaleReturn' })
  @Get()
  list(@CurrentUser() user: JwtPayload, @Param('saleId', ParseUUIDPipe) saleId: string) {
    return this.saleReturnsService.listForSale(user.tenantId, saleId);
  }
}

@ApiTags('sale-returns')
@ApiBearerAuth()
@Controller('sale-returns')
export class SaleReturnsController {
  constructor(private readonly saleReturnsService: SaleReturnsService) {}

  @CheckAbilities({ action: 'read', subject: 'SaleReturn' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.saleReturnsService.findByIdOrThrow(user.tenantId, id);
  }
}
