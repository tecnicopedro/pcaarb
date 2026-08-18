import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createStoreSchema, updateStoreSchema, type CreateStoreInput, type JwtPayload, type UpdateStoreInput } from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoresService } from './stores.service';

@ApiTags('stores')
@ApiBearerAuth()
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @CheckAbilities({ action: 'read', subject: 'Store' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.storesService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'create', subject: 'Store' })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(createStoreSchema)) body: CreateStoreInput) {
    return this.storesService.create(user.tenantId, body);
  }

  @CheckAbilities({ action: 'update', subject: 'Store' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStoreSchema)) body: UpdateStoreInput,
  ) {
    return this.storesService.update(user.tenantId, id, body);
  }
}
