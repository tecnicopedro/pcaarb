import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createFinanceEntrySchema,
  updateFinanceEntrySchema,
  type CreateFinanceEntryInput,
  type JwtPayload,
  type UpdateFinanceEntryInput,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance-entries')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @CheckAbilities({ action: 'read', subject: 'FinanceEntry' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.financeService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'read', subject: 'FinanceEntry' })
  @Get('summary')
  summary(@CurrentUser() user: JwtPayload) {
    return this.financeService.cashflowSummary(user.tenantId);
  }

  @CheckAbilities({ action: 'read', subject: 'FinanceEntry' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.financeService.findByIdOrThrow(user.tenantId, id);
  }

  @CheckAbilities({ action: 'create', subject: 'FinanceEntry' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createFinanceEntrySchema)) body: CreateFinanceEntryInput,
  ) {
    return this.financeService.create(user.tenantId, user.sub, body);
  }

  @CheckAbilities({ action: 'update', subject: 'FinanceEntry' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFinanceEntrySchema)) body: UpdateFinanceEntryInput,
  ) {
    return this.financeService.update(user.tenantId, id, body);
  }

  @CheckAbilities({ action: 'update', subject: 'FinanceEntry' })
  @Post(':id/pay')
  pay(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.financeService.pay(user.tenantId, id);
  }

  @CheckAbilities({ action: 'update', subject: 'FinanceEntry' })
  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.financeService.cancel(user.tenantId, id);
  }
}
