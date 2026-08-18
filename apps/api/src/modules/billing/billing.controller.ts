import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { subscribeInputSchema, type JwtPayload, type SubscribeInput } from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BypassTenantStatus } from '../../common/decorators/bypass-tenant-status.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BillingService } from './billing.service';

// @BypassTenantStatus() nos três: um tenant bloqueado por inadimplência
// precisa conseguir ver a fatura e reativar a assinatura — sem isso o
// TenantStatusGuard global bloquearia até o próprio endpoint de pagamento.
// @Roles('owner') nos que mudam dinheiro/compromisso: é decisão de dono do
// negócio, não gestão operacional — por isso role direto, não subject CASL.
@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @BypassTenantStatus()
  @Get('subscription')
  async getSubscription(@CurrentUser() user: JwtPayload) {
    const subscription = await this.billingService.getSubscription(user.tenantId);
    if (!subscription) {
      throw new NotFoundException('Nenhuma assinatura encontrada — tenant ainda não assinou um plano');
    }
    return subscription;
  }

  @BypassTenantStatus()
  @Get('invoices')
  listInvoices(@CurrentUser() user: JwtPayload) {
    return this.billingService.listInvoices(user.tenantId);
  }

  @BypassTenantStatus()
  @Roles('owner')
  @Post('subscribe')
  subscribe(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(subscribeInputSchema)) body: SubscribeInput) {
    return this.billingService.subscribe(user.tenantId, body);
  }

  @BypassTenantStatus()
  @Roles('owner')
  @Post('cancel')
  cancel(@CurrentUser() user: JwtPayload) {
    return this.billingService.cancel(user.tenantId);
  }
}
