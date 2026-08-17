import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createCostCenterSchema,
  updateCostCenterSchema,
  type CreateCostCenterInput,
  type JwtPayload,
  type UpdateCostCenterInput,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CostCentersService } from './cost-centers.service';

@ApiTags('cost-centers')
@ApiBearerAuth()
@Controller('cost-centers')
export class CostCentersController {
  constructor(private readonly costCentersService: CostCentersService) {}

  @CheckAbilities({ action: 'read', subject: 'CostCenter' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.costCentersService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'create', subject: 'CostCenter' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCostCenterSchema)) body: CreateCostCenterInput,
  ) {
    return this.costCentersService.create(user.tenantId, body);
  }

  @CheckAbilities({ action: 'update', subject: 'CostCenter' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCostCenterSchema)) body: UpdateCostCenterInput,
  ) {
    return this.costCentersService.update(user.tenantId, id, body);
  }
}
