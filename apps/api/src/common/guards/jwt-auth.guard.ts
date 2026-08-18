import { Injectable, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
// Reflector precisa ser um import de valor (não `import type`): o NestJS
// resolve esse construtor via emitDecoratorMetadata, que só emite o tipo
// real em tempo de execução para imports de valor.
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { API_KEY_PREFIX, ApiKeysService } from '../../modules/api-keys/api-keys.service';

/**
 * Guard global: toda rota exige JWT válido OU uma chave de API válida,
 * exceto as marcadas com @Public(). Aplicado uma vez no AppModule
 * (APP_GUARD) em vez de por controller, para que nenhuma rota nova saia
 * desprotegida por esquecimento.
 *
 * Chave de API é reconhecida pelo prefixo do token (não tenta parsear como
 * JWT primeiro) — quando valida, monta um `request.user` no mesmo formato
 * de JwtPayload que a estratégia JWT produziria, então RolesGuard/
 * TenantStatusGuard/AbilityGuard/CurrentUser e todo controller continuam
 * funcionando sem nenhuma mudança (ver pesquisa de arquitetura antes desta
 * feature — JwtPayload é o tipo usado literalmente em todo lugar da stack).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeysService: ApiKeysService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;

    if (token?.startsWith(API_KEY_PREFIX)) {
      const principal = await this.apiKeysService.validate(token);
      if (!principal) {
        // false faria o Nest devolver 403 (Forbidden) — semanticamente
        // errado aqui, é falha de AUTENTICAÇÃO (chave inválida/revogada/
        // expirada), o mesmo 401 que a estratégia JWT devolve pra token
        // inválido.
        throw new UnauthorizedException('Chave de API inválida, revogada ou expirada');
      }
      (request as Request & { user: typeof principal }).user = principal;
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
