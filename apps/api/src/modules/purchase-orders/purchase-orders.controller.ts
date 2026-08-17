import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createPurchaseOrderSchema, type CreatePurchaseOrderInput, type JwtPayload } from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PurchaseOrdersService } from './purchase-orders.service';

@ApiTags('purchase-orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @CheckAbilities({ action: 'read', subject: 'PurchaseOrder' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.purchaseOrdersService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'read', subject: 'PurchaseOrder' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrdersService.findByIdOrThrow(user.tenantId, id);
  }

  @CheckAbilities({ action: 'create', subject: 'PurchaseOrder' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: CreatePurchaseOrderInput,
  ) {
    return this.purchaseOrdersService.create(user.tenantId, user.sub, body);
  }

  @CheckAbilities({ action: 'update', subject: 'PurchaseOrder' })
  @Post(':id/receive')
  receive(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrdersService.receive(user.tenantId, user.sub, id);
  }

  @CheckAbilities({ action: 'update', subject: 'PurchaseOrder' })
  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrdersService.cancel(user.tenantId, id);
  }
}
