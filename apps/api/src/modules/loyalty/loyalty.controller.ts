import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { updateLoyaltyProgramSchema, type JwtPayload, type UpdateLoyaltyProgramInput } from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LoyaltyService } from './loyalty.service';

// Fidelidade é uma extensão de Cadastros de cliente — mesmo CASL subject
// ('Customer'), não um subject novo: quem já gerencia/lê clientes
// gerencia/lê o programa de pontos deles.
@ApiTags('loyalty')
@ApiBearerAuth()
@Controller()
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @CheckAbilities({ action: 'read', subject: 'Customer' })
  @Get('loyalty/program')
  getProgram(@CurrentUser() user: JwtPayload) {
    return this.loyaltyService.getProgram(user.tenantId);
  }

  @CheckAbilities({ action: 'update', subject: 'Customer' })
  @Patch('loyalty/program')
  updateProgram(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateLoyaltyProgramSchema)) body: UpdateLoyaltyProgramInput,
  ) {
    return this.loyaltyService.updateProgram(user.tenantId, body);
  }

  @CheckAbilities({ action: 'read', subject: 'Customer' })
  @Get('customers/:customerId/loyalty/balance')
  getBalance(@CurrentUser() user: JwtPayload, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.loyaltyService.getBalance(user.tenantId, customerId);
  }

  @CheckAbilities({ action: 'read', subject: 'Customer' })
  @Get('customers/:customerId/loyalty/ledger')
  getLedger(@CurrentUser() user: JwtPayload, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.loyaltyService.listLedger(user.tenantId, customerId);
  }
}
