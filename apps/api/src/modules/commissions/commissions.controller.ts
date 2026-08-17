import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  updateCommissionSettingsSchema,
  upsertSellerCommissionRateSchema,
  type JwtPayload,
  type UpdateCommissionSettingsInput,
  type UpsertSellerCommissionRateInput,
} from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CommissionsService } from './commissions.service';

// Comissão de vendedor é configuração de relatório/custo, não identidade de
// usuário — mesmo CASL subject de Relatórios ('Report'): 'manage' (só
// admin/owner) pra configurar taxas, 'read' (também financeiro) pra ver.
@ApiTags('commissions')
@ApiBearerAuth()
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('settings')
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.commissionsService.getSettings(user.tenantId);
  }

  @CheckAbilities({ action: 'manage', subject: 'Report' })
  @Patch('settings')
  updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateCommissionSettingsSchema)) body: UpdateCommissionSettingsInput,
  ) {
    return this.commissionsService.updateSettings(user.tenantId, body);
  }

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('rates')
  listRates(@CurrentUser() user: JwtPayload) {
    return this.commissionsService.listRates(user.tenantId);
  }

  @CheckAbilities({ action: 'manage', subject: 'Report' })
  @Put('rates/:userId')
  upsertRate(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(upsertSellerCommissionRateSchema)) body: UpsertSellerCommissionRateInput,
  ) {
    return this.commissionsService.upsertRate(user.tenantId, userId, body);
  }

  @CheckAbilities({ action: 'manage', subject: 'Report' })
  @Delete('rates/:userId')
  removeRate(@CurrentUser() user: JwtPayload, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.commissionsService.removeRate(user.tenantId, userId);
  }
}
