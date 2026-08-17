import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  acceptInviteSchema,
  loginSchema,
  registerTenantSchema,
  type AcceptInviteInput,
  type LoginInput,
  type RegisterTenantInput,
} from '@pcaarb/shared';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
// Import de valor: necessário para o NestJS injetar via emitDecoratorMetadata.
import { AuthService } from './auth.service';

const refreshSchema = z.object({ refreshToken: z.string().min(1) });
type RefreshInput = z.infer<typeof refreshSchema>;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerTenantSchema))
  register(@Body() body: RegisterTenantInput) {
    return this.authService.register(body);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginInput) {
    return this.authService.login(body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() body: RefreshInput) {
    return this.authService.refresh(body.refreshToken);
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(acceptInviteSchema))
  acceptInvite(@Body() body: AcceptInviteInput) {
    return this.authService.acceptInvite(body);
  }
}
