import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createPermissionOverrideSchema, type CreatePermissionOverrideInput, type JwtPayload } from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionOverridesService } from './permission-overrides.service';

// Exceção de permissão é uma extensão de gestão de usuários — mesmo CASL
// subject ('User'), não um subject novo. Só quem gerencia usuários gerencia
// as exceções pontuais dentro deles.
@ApiTags('permission-overrides')
@ApiBearerAuth()
@Controller('users/:userId/permission-overrides')
export class PermissionOverridesController {
  constructor(private readonly permissionOverridesService: PermissionOverridesService) {}

  @CheckAbilities({ action: 'read', subject: 'User' })
  @Get()
  list(@CurrentUser() user: JwtPayload, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.permissionOverridesService.list(user.tenantId, userId);
  }

  @CheckAbilities({ action: 'update', subject: 'User' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(createPermissionOverrideSchema)) body: CreatePermissionOverrideInput,
  ) {
    return this.permissionOverridesService.create(user.tenantId, userId, user.sub, body);
  }

  @CheckAbilities({ action: 'update', subject: 'User' })
  @Delete(':overrideId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
  ) {
    return this.permissionOverridesService.remove(user.tenantId, userId, overrideId);
  }
}
