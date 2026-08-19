import { Injectable, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
// Reflector needs to be a value import (not `import type`): NestJS
// resolves this constructor via emitDecoratorMetadata, which only emits
// the actual type at runtime for value imports.
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { API_KEY_PREFIX, ApiKeysService } from '../../modules/api-keys/api-keys.service';

/**
 * Global guard: every route requires a valid JWT OR a valid API key,
 * except ones marked with @Public(). Applied once in AppModule
 * (APP_GUARD) instead of per-controller, so no new route ends up
 * unprotected by oversight.
 *
 * API key is recognized by the token's prefix (doesn't try parsing it as
 * a JWT first) — once validated, it builds a `request.user` in the same
 * JwtPayload shape the JWT strategy would produce, so RolesGuard/
 * TenantStatusGuard/AbilityGuard/CurrentUser and every controller keep
 * working with no changes at all (see the architecture research done
 * before this feature — JwtPayload is the type used literally everywhere
 * in the stack).
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
        // Returning false would make Nest respond 403 (Forbidden) — semantically
        // wrong here, this is an AUTHENTICATION failure (invalid/revoked/
        // expired key), the same 401 the JWT strategy returns for an
        // invalid token.
        throw new UnauthorizedException('Chave de API inválida, revogada ou expirada');
      }
      (request as Request & { user: typeof principal }).user = principal;
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
