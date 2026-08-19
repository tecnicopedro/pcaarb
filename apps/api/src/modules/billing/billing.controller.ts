import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { subscribeInputSchema, type JwtPayload, type SubscribeInput } from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BypassTenantStatus } from '../../common/decorators/bypass-tenant-status.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from './billing.service';

// @BypassTenantStatus() nos quatro: um tenant bloqueado por inadimplência
// precisa conseguir ver a fatura e reativar a assinatura — sem isso o
// TenantStatusGuard global bloquearia até o próprio endpoint de pagamento.
// @Roles('owner') nos que mudam dinheiro/compromisso: é decisão de dono do
// negócio, não gestão operacional — por isso role direto, não subject CASL.
// @Roles('owner', 'admin') nos dois de leitura: achado de revisão de
// segurança (2026-08-18) — sem nenhum @Roles/@CheckAbilities, os dois
// endpoints de GET ficavam de fato abertos pra qualquer papel autenticado
// do tenant (RolesGuard e AbilityGuard são "no-op" quando a rota não
// declara nada, ver seus próprios comentários), deixando operador_caixa/
// financeiro verem plano/preço/histórico de cobrança — informação de
// negócio que este mesmo arquivo já trata como domínio do dono/admin, não
// operacional.
@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @BypassTenantStatus()
  @Roles('owner', 'admin')
  @Get('subscription')
  async getSubscription(@CurrentUser() user: JwtPayload) {
    const subscription = await this.billingService.getSubscription(user.tenantId);
    if (!subscription) {
      throw new NotFoundException('Nenhuma assinatura encontrada — tenant ainda não assinou um plano');
    }
    return subscription;
  }

  @BypassTenantStatus()
  @Roles('owner', 'admin')
  @Get('invoices')
  listInvoices(@CurrentUser() user: JwtPayload) {
    return this.billingService.listInvoices(user.tenantId);
  }

  @BypassTenantStatus()
  @Roles('owner')
  @Post('subscribe')
  async subscribe(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(subscribeInputSchema)) body: SubscribeInput) {
    const subscription = await this.billingService.subscribe(user.tenantId, body);
    await this.auditLogService.record({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      action: 'billing.subscribed',
      targetType: 'Tenant',
      targetId: user.tenantId,
      metadata: { plan: body.plan },
    });
    return subscription;
  }

  @BypassTenantStatus()
  @Roles('owner')
  @Post('cancel')
  async cancel(@CurrentUser() user: JwtPayload) {
    const subscription = await this.billingService.cancel(user.tenantId);
    await this.auditLogService.record({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      action: 'billing.canceled',
      targetType: 'Tenant',
      targetId: user.tenantId,
    });
    return subscription;
  }
}
