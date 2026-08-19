import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  inviteUserSchema,
  updateUserRoleSchema,
  type InviteUserInput,
  type JwtPayload,
  type UpdateUserRoleInput,
} from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { UserRow } from '../../database/schema/index';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from './users.service';

// passwordHash never leaves the API.
function toSafeUser({ passwordHash: _passwordHash, ...safeUser }: UserRow) {
  return safeUser;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // No @CheckAbilities: reading your own identity isn't user management,
  // every role can see who they are and which company they're in.
  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    const [me, tenant] = await Promise.all([
      this.usersService.findById(user.sub),
      this.tenantsService.findById(user.tenantId),
    ]);
    if (!me || !tenant) {
      throw new NotFoundException('Usuário ou tenant não encontrado');
    }
    return { user: toSafeUser(me), tenant };
  }

  @CheckAbilities({ action: 'read', subject: 'User' })
  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    const list = await this.usersService.listByTenant(user.tenantId);
    return list.map(toSafeUser);
  }

  @CheckAbilities({ action: 'read', subject: 'User' })
  @Get('invites')
  async listInvites(@CurrentUser() user: JwtPayload) {
    const invites = await this.usersService.listPendingInvites(user.tenantId);
    return invites.map(({ tokenHash: _tokenHash, ...safeInvite }) => safeInvite);
  }

  @CheckAbilities({ action: 'create', subject: 'UserAccess' })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('invite')
  async invite(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput,
  ) {
    const inviter = await this.usersService.findById(user.sub);
    if (!inviter) {
      throw new Error('Usuário autenticado não encontrado');
    }
    const invite = await this.usersService.inviteUser(
      user.tenantId,
      { id: inviter.id, name: inviter.name, role: inviter.role },
      body,
    );
    // tokenHash never leaves the API — only the email adapter sees the raw token.
    const { tokenHash: _tokenHash, ...safeInvite } = invite;
    return safeInvite;
  }

  @CheckAbilities({ action: 'create', subject: 'UserAccess' })
  @Delete('invites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.revokeInvite(user.tenantId, id);
  }

  // Subject 'UserAccess' (not 'User'): changing a role grants admin-equivalent
  // control, so it can't be the target of a one-off override — see the
  // exclusion in permissionSubjectSchema (packages/shared).
  @CheckAbilities({ action: 'update', subject: 'UserAccess' })
  @Patch(':id/role')
  async updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserRoleSchema)) body: UpdateUserRoleInput,
  ) {
    // The JWT's role may be stale (e.g. user demoted after the token was
    // issued) — re-read from the database to decide owner permissions.
    const acting = await this.usersService.findById(user.sub);
    if (!acting) {
      throw new UnauthorizedException('Usuário autenticado não encontrado');
    }
    const updated = await this.usersService.updateRole(user.tenantId, acting.role, id, body.role);
    await this.auditLogService.record({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      action: 'user.role_updated',
      targetType: 'User',
      targetId: id,
      metadata: { newRole: body.role },
    });
    return toSafeUser(updated);
  }

  // Same subject as updateRole — deactivating access is as sensitive as
  // changing a role. Never a hard delete, see UsersService.deactivate.
  @CheckAbilities({ action: 'update', subject: 'UserAccess' })
  @Delete(':id')
  async deactivate(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    const acting = await this.usersService.findById(user.sub);
    if (!acting) {
      throw new UnauthorizedException('Usuário autenticado não encontrado');
    }
    const updated = await this.usersService.deactivate(user.tenantId, user.sub, acting.role, id);
    await this.auditLogService.record({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      action: 'user.deactivated',
      targetType: 'User',
      targetId: id,
    });
    return toSafeUser(updated);
  }
}
