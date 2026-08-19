import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createApiKeySchema, type CreateApiKeyInput, type JwtPayload } from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from '../users/users.service';
import { ApiKeysService } from './api-keys.service';

// Same 'Integration' subject as the marketplace module — an API key IS a
// way of configuring an external integration, not a separate concept that
// would need its own CASL subject. 'Integration' is excluded from
// permissionSubjectSchema (packages/shared), so only the base admin/owner
// role reaches here, never via a one-off override — see the comment in
// that schema for the reason (security review finding, 2026-08-18).
@ApiTags('api-keys')
@ApiBearerAuth()
@Controller('api-keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly usersService: UsersService,
  ) {}

  @CheckAbilities({ action: 'read', subject: 'Integration' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.apiKeysService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'create', subject: 'Integration' })
  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
  ) {
    // Role read fresh from the database (not from the JWT, which may be
    // stale) — same precaution as UsersController.updateRole.
    const acting = await this.usersService.findById(user.sub);
    if (!acting) {
      throw new UnauthorizedException('Usuário autenticado não encontrado');
    }
    return this.apiKeysService.create(user.tenantId, user.sub, acting.role, body);
  }

  @CheckAbilities({ action: 'delete', subject: 'Integration' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.apiKeysService.revoke(user.tenantId, id, user.sub);
  }
}
