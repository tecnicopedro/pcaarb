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
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from './users.service';

// passwordHash nunca sai da API.
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
  ) {}

  // Sem @CheckAbilities: ler a própria identidade não é gestão de usuários,
  // todo papel pode ver quem é e em que empresa está.
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

  @CheckAbilities({ action: 'create', subject: 'User' })
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
    // O papel do JWT pode estar desatualizado (ex.: usuário rebaixado após o
    // token ser emitido) — relê do banco pra decidir permissões de owner.
    const acting = await this.usersService.findById(user.sub);
    if (!acting) {
      throw new UnauthorizedException('Usuário autenticado não encontrado');
    }
    const updated = await this.usersService.updateRole(user.tenantId, acting.role, id, body.role);
    return toSafeUser(updated);
  }
}
