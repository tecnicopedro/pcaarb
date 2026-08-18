import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { reportPeriodQuerySchema, type JwtPayload, type ReportPeriodQuery } from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReportsService } from './reports.service';

function setCsvHeaders(res: Response, filenamePrefix: string, range: ReportPeriodQuery) {
  const suffix = range.from || range.to ? `_${range.from ?? 'inicio'}_a_${range.to ?? 'hoje'}` : '';
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filenamePrefix}${suffix}.csv"`,
  });
}

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
  @Get('lojas-ranking')
  storeRanking(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery,
  ) {
    return this.reportsService.storeRanking(user.tenantId, query);
  }

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('comissoes')
  commissionReport(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery,
  ) {
    return this.reportsService.commissionReport(user.tenantId, query);
  }

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('dre')
  dre(@CurrentUser() user: JwtPayload, @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery) {
    return this.reportsService.dre(user.tenantId, query);
  }

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('exportar/vendas.csv')
  async exportSales(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    setCsvHeaders(res, 'vendas', query);
    return this.reportsService.exportSalesCsv(user.tenantId, query);
  }

  @CheckAbilities({ action: 'read', subject: 'Report' })
  @Get('exportar/financeiro.csv')
  async exportFinance(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportPeriodQuerySchema)) query: ReportPeriodQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    setCsvHeaders(res, 'financeiro', query);
    return this.reportsService.exportFinanceCsv(user.tenantId, query);
  }
}
