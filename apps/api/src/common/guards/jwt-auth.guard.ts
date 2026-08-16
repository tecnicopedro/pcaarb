import { Injectable, type ExecutionContext } from '@nestjs/common';
// Reflector precisa ser um import de valor (não `import type`): o NestJS
// resolve esse construtor via emitDecoratorMetadata, que só emite o tipo
// real em tempo de execução para imports de valor.
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard global: toda rota exige JWT válido, exceto as marcadas com @Public().
 * Aplicado uma vez no AppModule (APP_GUARD) em vez de por controller,
 * para que nenhuma rota nova saia desprotegida por esquecimento.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
