import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  registerTenantSchema,
  resetPasswordSchema,
  type AcceptInviteInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterTenantInput,
  type ResetPasswordInput,
} from '@pcaarb/shared';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
// Value import: needed for NestJS to inject via emitDecoratorMetadata.
import { AuthService } from './auth.service';

const refreshSchema = z.object({ refreshToken: z.string().min(1) });
type RefreshInput = z.infer<typeof refreshSchema>;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Registration isn't a brute-force target like login — the limit exists
  // only to stop an automated flood of accounts, not to be as tight as
  // login. 5/min was producing false positives even for legitimate bursty
  // use.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
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
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(new ZodValidationPipe(refreshSchema))
  async logout(@Body() body: RefreshInput) {
    await this.authService.logout(body.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(acceptInviteSchema))
  acceptInvite(@Body() body: AcceptInviteInput) {
    return this.authService.acceptInvite(body);
  }

  @Public()
  // Same tight limit as login: this endpoint is the starting point of a
  // volume-based email enumeration attack, even though it always responds
  // 204.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  async forgotPassword(@Body() body: ForgotPasswordInput) {
    await this.authService.requestPasswordReset(body.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  async resetPassword(@Body() body: ResetPasswordInput) {
    await this.authService.resetPassword(body.id, body.token, body.password);
  }
}
