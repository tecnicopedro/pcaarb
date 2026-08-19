import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { JwtPayload } from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DataPrivacyService } from './data-privacy.service';

@ApiTags('data-privacy')
@ApiBearerAuth()
@Controller('data-privacy/customers/:id')
export class DataPrivacyController {
  constructor(private readonly dataPrivacyService: DataPrivacyService) {}

  @CheckAbilities({ action: 'manage', subject: 'DataPrivacy' })
  @Get('export')
  async export(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.dataPrivacyService.exportCustomerData(user.tenantId, id, user.sub);
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="cliente_${id}_dados.json"`,
    });
    return data;
  }

  @CheckAbilities({ action: 'manage', subject: 'DataPrivacy' })
  @Post('anonymize')
  @HttpCode(HttpStatus.OK)
  anonymize(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.dataPrivacyService.anonymizeCustomerData(user.tenantId, id, user.sub);
  }
}
