import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
import { UsersService } from './users.service';

// passwordHash nunca sai da API.
function toSafeUser({ passwordHash: _passwordHash, ...safeUser }: UserRow) {
  return safeUser;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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

  @CheckAbilities({ action: 'create', subject: 'User' })
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
    // tokenHash nunca sai da API — só o adapter de e-mail vê o token cru.
    const { tokenHash: _tokenHash, ...safeInvite } = invite;
    return safeInvite;
  }

  @CheckAbilities({ action: 'create', subject: 'User' })
  @Delete('invites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.revokeInvite(user.tenantId, id);
  }

  @CheckAbilities({ action: 'update', subject: 'User' })
  @Patch(':id/role')
  async updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserRoleSchema)) body: UpdateUserRoleInput,
  ) {
    const updated = await this.usersService.updateRole(user.tenantId, user.role, id, body.role);
    return toSafeUser(updated);
  }
}
