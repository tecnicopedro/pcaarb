import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createApiKeySchema, type CreateApiKeyInput, type JwtPayload } from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from '../users/users.service';
import { ApiKeysService } from './api-keys.service';

// Mesmo subject 'Integration' do módulo de marketplace (admin/owner-only) —
// chave de API É uma forma de configurar integração externa, não um
// conceito à parte que precisaria de um novo subject CASL.
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
    // Papel lido fresco do banco (não do JWT, que pode estar desatualizado)
    // — mesmo cuidado de UsersController.updateRole.
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
