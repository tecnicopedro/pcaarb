import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { reportPeriodQuerySchema, type JwtPayload, type ReportPeriodQuery } from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('vendas-resumo')
  summary(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery,
  ) {
    return this.reportsService.summary(user.tenantId, query);
  }

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('produtos-ranking')
  productRanking(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery,
  ) {
    return this.reportsService.productRanking(user.tenantId, query);
  }

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('curva-abc')
  abcCurve(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery,
  ) {
    return this.reportsService.abcCurve(user.tenantId, query);
  }

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('vendedores-ranking')
  sellerRanking(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery,
  ) {
    return this.reportsService.sellerRanking(user.tenantId, query);
  }

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('dre')
  dre(@CurrentUser() user: JwtPayload, @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery) {
    return this.reportsService.dre(user.tenantId, query);
  }
}
