import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createSaleSchema, type CreateSaleInput, type JwtPayload } from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @CheckAbilities({ action: 'create', subject: 'Sale' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSaleSchema)) body: CreateSaleInput,
  ) {
    return this.salesService.create(user.tenantId, user.sub, body);
  }

  @CheckAbilities({ action: 'read', subject: 'Sale' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.salesService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'read', subject: 'Sale' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.findByIdOrThrow(user.tenantId, id);
  }
}
