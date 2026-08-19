import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createPermissionOverrideSchema, type CreatePermissionOverrideInput, type JwtPayload } from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PermissionOverridesService } from './permission-overrides.service';

// A permission exception is an extension of user management — the same CASL
// subject ('UserAccess'), not a new subject. Only whoever manages users
// manages the one-off exceptions within them.
//
// Deliberately 'UserAccess', not 'User': if this controller used the 'User'
// subject (which is overridable), a user with a one-off update:User override
// granted to them would gain the power to create/remove overrides for any
// user in the tenant — including for themselves, granting 'manage' on any
// other business subject. 'UserAccess' is excluded from
// permissionSubjectSchema (packages/shared), so this meta-power can never be
// granted outside of the base admin/owner role.
@ApiTags('permission-overrides')
@ApiBearerAuth()
@Controller('users/:userId/permission-overrides')
export class PermissionOverridesController {
  constructor(
    private readonly permissionOverridesService: PermissionOverridesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @CheckAbilities({ action: 'read', subject: 'UserAccess' })
  @Get()
  list(@CurrentUser() user: JwtPayload, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.permissionOverridesService.list(user.tenantId, userId);
  }

  @CheckAbilities({ action: 'update', subject: 'UserAccess' })
  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(createPermissionOverrideSchema)) body: CreatePermissionOverrideInput,
  ) {
    const override = await this.permissionOverridesService.create(user.tenantId, userId, user.sub, body);
    await this.auditLogService.record({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      action: 'permission_override.granted',
      targetType: 'User',
      targetId: userId,
      metadata: { subject: body.subject, action: body.action, effect: body.effect },
    });
    return override;
  }

  @CheckAbilities({ action: 'update', subject: 'UserAccess' })
  @Delete(':overrideId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
  ) {
    await this.permissionOverridesService.remove(user.tenantId, userId, overrideId);
    await this.auditLogService.record({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      action: 'permission_override.revoked',
      targetType: 'User',
      targetId: userId,
      metadata: { overrideId },
    });
  }
}
