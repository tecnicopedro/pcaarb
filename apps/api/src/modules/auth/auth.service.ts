import { randomBytes } from 'node:crypto';
import { ConflictException, GoneException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
// The four classes below are imported by value (not `import type`) on
// purpose: they're injected in the constructor and NestJS resolves them via
// emitDecoratorMetadata, which only emits the real type for value imports.
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { AcceptInviteInput, AuthTokens, LoginInput, RegisterTenantInput } from '@pcaarb/shared';
import type { Env } from '../../config/env.validation';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { passwordResetTokens, refreshTokens, users, type UserRow } from '../../database/schema/index';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email-provider.interface';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';

const BCRYPT_ROUNDS = 12;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

// Fixed hash generated once at boot (not per request) — compared against
// when the email doesn't exist, so login never leaks via response time
// whether an email is registered or not. Without this, "email not found"
// responds at the speed of an indexed query (a few ms) and "wrong password"
// at the speed of bcrypt.compare (tens of ms) — same error message in both
// cases, but the response time alone is already an email enumeration oracle
// (security review finding, 2026-08-18).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('senha-fixa-so-pra-igualar-o-tempo-de-resposta', BCRYPT_ROUNDS);

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
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    private readonly auditLogService: AuditLogService,
  ) {}

  async register(input: RegisterTenantInput): Promise<AuthTokens> {
    const { owner } = await this.tenantsService.registerWithOwner(input);
    return this.issueTokens(owner);
  }

  async acceptInvite(input: AcceptInviteInput): Promise<AuthTokens> {
    const user = await this.usersService.acceptInvite(input);
    return this.issueTokens(user);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await this.usersService.findByEmail(input.email);
    // bcrypt.compare always runs, even without a user — against the real
    // hash if one exists, against the dummy if not. Never skip this step
    // conditionally (see DUMMY_PASSWORD_HASH above).
    const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    // Checked BEFORE the password decides the response, with the SAME
    // message whether the password is right or wrong: otherwise the
    // "locked" message only appearing when the password matches becomes a
    // password-guessing oracle usable even with the account locked
    // (security review finding, 2026-08-19) — an attacker with a leaked
    // credential would lock the account on purpose (5 wrong attempts) and
    // then send the candidate password: "locked" instead of "invalid"
    // confirmed the password was correct, without ever completing an
    // actual login (and without generating any successful-login event for
    // anyone to notice). This isn't new email enumeration: it only fires
    // for accounts that exist, same rationale already accepted before this
    // fix.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Conta temporariamente bloqueada por muitas tentativas de login — tente novamente mais tarde');
    }

    // A deactivated user (see users.active) is treated as an invalid
    // credential — same generic message as always, never "account
    // deactivated": revealing that distinct state to whoever only has the
    // password (e.g. a former employee) would be an unnecessary account
    // status leak.
    if (!user || !passwordMatches || !user.active) {
      if (user && user.active) {
        await this.usersService.registerFailedLogin(user);
      }
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    if (user.failedLoginAttempts > 0) {
      await this.usersService.clearLoginLockout(user.id);
    }

    return this.issueTokens(user);
  }

  // Always "succeeds" from the caller's point of view, whether the email
  // exists or not — same anti-enumeration discipline as login. The token's
  // bcrypt hash runs even without a user, equalizing CPU cost; the actual
  // email-sending time (network, outside our control) is an accepted
  // residual, same reasoning already documented for the invite token:
  // there's no way to fake a third-party provider's network latency without
  // making the experience worse for someone who legitimately forgot their
  // password.
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);

    if (!user || user.isServiceAccount) {
      return;
    }

    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    // Same rationale as the invite: a token whose email was never delivered
    // is useless, so the record is rolled back too if sending fails.
    await this.db.transaction(async (tx) => {
      const [tokenRow] = await tx.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt }).returning();
      if (!tokenRow) {
        throw new Error('Falha ao criar token de redefinição de senha');
      }
      const resetUrl = `${this.config.get('CORS_ORIGIN', { infer: true })}/redefinir-senha?id=${tokenRow.id}&token=${rawToken}`;
      await this.emailProvider.sendPasswordReset({ to: user.email, resetUrl });
    });
  }

  async resetPassword(id: string, token: string, newPassword: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [tokenRow] = await tx.select().from(passwordResetTokens).where(eq(passwordResetTokens.id, id)).limit(1);
      if (!tokenRow) {
        throw new UnauthorizedException('Link de redefinição inválido');
      }
      if (tokenRow.usedAt) {
        throw new ConflictException('Este link já foi utilizado');
      }
      if (tokenRow.expiresAt < new Date()) {
        throw new GoneException('Este link expirou — peça uma nova redefinição');
      }
      const tokenMatches = await bcrypt.compare(token, tokenRow.tokenHash);
      if (!tokenMatches) {
        throw new UnauthorizedException('Link de redefinição inválido');
      }

      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      const [updatedUser] = await tx
        .update(users)
        .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(users.id, tokenRow.userId))
        .returning({ tenantId: users.tenantId });
      if (!updatedUser) {
        throw new Error('Falha ao atualizar senha do usuário');
      }
      await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, tokenRow.id));
      // Changing the password must not leave old sessions (possibly
      // compromised — that's the scenario that motivates a reset) still
      // valid.
      await tx.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, tokenRow.userId));

      await this.auditLogService.recordTx(tx, {
        tenantId: updatedUser.tenantId,
        actorUserId: tokenRow.userId,
        action: 'auth.password_reset',
        targetType: 'User',
        targetId: tokenRow.userId,
      });
    });
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
    // Defense in depth: UsersService.deactivate() already revokes existing
    // refresh tokens at deactivation time, so this case would only fire if
    // some other path left an active token behind — but even so, refresh
    // should never return a new token for a deactivated account (security
    // review finding, 2026-08-19).
    if (!user || !user.active) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    return this.issueTokens(user);
  }

  // Logout is the only way to kill a refresh token before its time — without
  // it, a leaked token stays valid until it expires (rotation only revokes
  // the previous one when the token IS USED to get a new one). Tolerant of
  // an already invalid/revoked token: logout always "works" from the
  // client's point of view, there's nothing sensitive about confirming that
  // without an error.
  async logout(rawToken: string): Promise<void> {
    let payload: RefreshJwtPayload;
    try {
      payload = await this.verifyRefreshToken(rawToken);
    } catch {
      return;
    }

    const [tokenRow] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, payload.jti))
      .limit(1);
    if (!tokenRow || tokenRow.revoked) {
      return;
    }

    const matches = await bcrypt.compare(rawToken, tokenRow.tokenHash);
    if (!matches) {
      return;
    }

    await this.db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.id, tokenRow.id));
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
