import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
// As quatro classes abaixo são importadas por valor (não `import type`) de
// propósito: são injetadas no construtor e o NestJS as resolve via
// emitDecoratorMetadata, que só emite o tipo real para imports de valor.
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { AuthTokens, LoginInput, RegisterTenantInput } from '@pcaarb/shared';
import type { Env } from '../../config/env.validation';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { refreshTokens, type UserRow } from '../../database/schema/index';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';

const BCRYPT_ROUNDS = 12;

interface RefreshJwtPayload {
  sub: string;
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
  ) {}

  async register(input: RegisterTenantInput): Promise<AuthTokens> {
    const { owner } = await this.tenantsService.registerWithOwner(input);
    return this.issueTokens(owner);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await this.usersService.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    return this.issueTokens(user);
  }

  async refresh(rawToken: string): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(rawToken);

    const [tokenRow] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, payload.jti))
      .limit(1);

    if (!tokenRow || tokenRow.revoked || tokenRow.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const matches = await bcrypt.compare(rawToken, tokenRow.tokenHash);
    if (!matches) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    await this.db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.id, tokenRow.id));

    const user = await this.usersService.findById(tokenRow.userId);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    return this.issueTokens(user);
  }

  private async verifyRefreshToken(rawToken: string): Promise<RefreshJwtPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshJwtPayload>(rawToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
  }

  private async issueTokens(user: UserRow): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, tenantId: user.tenantId, role: user.role },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      },
    );

    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const expiresAt = new Date(Date.now() + parseTtlToMs(refreshTtl));

    const [tokenRow] = await this.db
      .insert(refreshTokens)
      .values({ userId: user.id, tokenHash: 'pending', expiresAt })
      .returning();
    if (!tokenRow) {
      throw new Error('Falha ao emitir refresh token');
    }

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, jti: tokenRow.id },
      { secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }), expiresIn: refreshTtl },
    );

    const tokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.db.update(refreshTokens).set({ tokenHash }).where(eq(refreshTokens.id, tokenRow.id));

    return { accessToken, refreshToken };
  }
}

function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as 's' | 'm' | 'h' | 'd'];
  return value * unitMs;
}
