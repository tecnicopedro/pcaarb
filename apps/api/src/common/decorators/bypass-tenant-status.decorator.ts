import { SetMetadata } from '@nestjs/common';

export const BYPASS_TENANT_STATUS_KEY = 'bypassTenantStatus';

/**
 * Marca uma rota como acessível mesmo com tenant `blocked`/`canceled` — sem
 * isso, um tenant bloqueado por falta de pagamento não conseguiria nem ver
 * sua fatura nem reativar a assinatura, porque o TenantStatusGuard bloqueia
 * tudo antes de chegar no controller. Uso restrito a endpoints de billing
 * (consultar assinatura/faturas, reativar).
 */
export const BypassTenantStatus = () => SetMetadata(BYPASS_TENANT_STATUS_KEY, true);
