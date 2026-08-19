import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { subscribeInputSchema, type JwtPayload, type SubscribeInput } from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BypassTenantStatus } from '../../common/decorators/bypass-tenant-status.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from './billing.service';

// @BypassTenantStatus() on all four: a tenant blocked for non-payment still
// needs to be able to view the invoice and reactivate the subscription —
// without this the global TenantStatusGuard would block even the payment
// endpoint itself. @Roles('owner') on the ones that move money/commitment:
// that's a business-owner decision, not operational management — hence a
// direct role check, not a CASL subject. @Roles('owner', 'admin') on the two
// read endpoints: security review finding (2026-08-18) — with no
// @Roles/@CheckAbilities at all, the two GET endpoints were effectively open
// to any authenticated role in the tenant (RolesGuard and AbilityGuard are a
// no-op when the route declares nothing, see their own comments), letting
// operador_caixa/financeiro see the plan/price/billing history — business
// information this same file already treats as owner/admin territory, not
// operational.
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
