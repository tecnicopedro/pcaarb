import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  closeCashSessionSchema,
  createCashMovementSchema,
  openCashSessionSchema,
  type CloseCashSessionInput,
  type CreateCashMovementInput,
  type JwtPayload,
  type OpenCashSessionInput,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CashSessionsService } from './cash-sessions.service';

@ApiTags('cash-sessions')
@ApiBearerAuth()
@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly cashSessionsService: CashSessionsService) {}

  @CheckAbilities({ action: 'create', subject: 'CashSession' })
  @Post()
  open(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(openCashSessionSchema)) body: OpenCashSessionInput,
  ) {
    return this.cashSessionsService.open(user.tenantId, user.sub, body);
  }

  @CheckAbilities({ action: 'read', subject: 'CashSession' })
  @Get('current')
  async current(@CurrentUser() user: JwtPayload) {
    const session = await this.cashSessionsService.getCurrentOpenSession(user.tenantId, user.sub);
    if (!session) {
      throw new NotFoundException('Nenhum caixa aberto no momento');
    }
    return session;
  }

  @CheckAbilities({ action: 'read', subject: 'CashSession' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.cashSessionsService.findByIdOrThrow(user.tenantId, id);
  }

  @CheckAbilities({ action: 'update', subject: 'CashSession' })
  @Post(':id/close')
  close(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(closeCashSessionSchema)) body: CloseCashSessionInput,
  ) {
    return this.cashSessionsService.close(user.tenantId, user.sub, id, body);
  }

  @CheckAbilities({ action: 'update', subject: 'CashSession' })
  @Post(':id/movements')
  addMovement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createCashMovementSchema)) body: CreateCashMovementInput,
  ) {
    return this.cashSessionsService.addMovement(user.tenantId, user.sub, id, body);
  }

  @CheckAbilities({ action: 'read', subject: 'CashSession' })
  @Get(':id/movements')
  listMovements(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.cashSessionsService.listMovements(user.tenantId, id);
  }
}
