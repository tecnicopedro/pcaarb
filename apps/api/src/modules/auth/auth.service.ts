import { randomBytes } from 'node:crypto';
import { ConflictException, GoneException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
// As quatro classes abaixo são importadas por valor (não `import type`) de
// propósito: são injetadas no construtor e o NestJS as resolve via
// emitDecoratorMetadata, que só emite o tipo real para imports de valor.
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { AcceptInviteInput, AuthTokens, LoginInput, RegisterTenantInput } from '@pcaarb/shared';
import type { Env } from '../../config/env.validation';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { passwordResetTokens, refreshTokens, users, type UserRow } from '../../database/schema/index';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email-provider.interface';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';

const BCRYPT_ROUNDS = 12;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

// Hash fixo gerado uma vez no boot (não por request) — comparado quando o
// e-mail não existe, pra login nunca vazar por tempo de resposta se um
// e-mail está cadastrado ou não. Sem isso, "e-mail não encontrado" responde
// na velocidade de uma query indexada (poucos ms) e "senha errada" na
// velocidade do bcrypt.compare (dezenas de ms) — mesma mensagem de erro nos
// dois casos, mas o tempo de resposta já é um oráculo de enumeração de
// e-mail (achado de revisão de segurança, 2026-08-18).
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
    // bcrypt.compare roda sempre, mesmo sem usuário — contra o hash real se
    // existe, contra o dummy se não. Nunca pular esse passo condicionalmente
    // (ver DUMMY_PASSWORD_HASH acima).
    const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    // Checado ANTES da senha decidir a resposta, com a MESMA mensagem
    // esteja a senha certa ou errada: senão a mensagem de "bloqueada" só
    // aparecer quando a senha bate vira um oráculo de acerto de senha
    // utilizável mesmo com a conta bloqueada (achado de revisão de
    // segurança, 2026-08-19) — um atacante com uma credencial vazada
    // bloqueava a conta de propósito (5 tentativas erradas) e depois
    // mandava a senha candidata: "bloqueada" em vez de "inválidos"
    // confirmava a senha certa, sem nunca completar um login de verdade
    // (e sem gerar nenhum evento de login bem-sucedido pra alguém notar).
    // Não é enumeração de e-mail nova: só dispara pra contas que existem,
    // mesmo racional já aceito antes desta correção.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Conta temporariamente bloqueada por muitas tentativas de login — tente novamente mais tarde');
    }

    if (!user || !passwordMatches) {
      if (user) {
        await this.usersService.registerFailedLogin(user);
      }
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    if (user.failedLoginAttempts > 0) {
      await this.usersService.clearLoginLockout(user.id);
    }

    return this.issueTokens(user);
  }

  // Sempre "sucede" do ponto de vista do chamador, e-mail exista ou não —
  // mesma disciplina anti-enumeração do login. O hash bcrypt do token roda
  // mesmo sem usuário, igualando o custo de CPU; o tempo de envio real do
  // e-mail (rede, fora do nosso controle) é um resíduo aceito, mesmo
  // raciocínio já documentado para o token de convite: não dá pra fingir
  // latência de rede de um provedor de terceiro sem piorar a experiência de
  // quem legitimamente esqueceu a senha.
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);

    if (!user || user.isServiceAccount) {
      return;
    }

    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    // Mesmo racional do convite: token sem e-mail entregue não serve pra
    // nada, então o registro é desfeito junto se o envio falhar.
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
      await tx.update(users).set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, tokenRow.userId));
      await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, tokenRow.id));
      // Troca de senha não deve deixar sessões antigas (possivelmente
      // comprometidas — é o cenário que motiva um reset) continuarem válidas.
      await tx.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, tokenRow.userId));
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
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    return this.issueTokens(user);
  }

  // Logout é o único jeito de matar um refresh token antes da hora — sem
  // isso, um token vazado fica válido até expirar (rotação só revoga o
  // anterior quando o token É USADO pra pegar um novo). Tolerante a token
  // já inválido/revogado: logout sempre "funciona" do ponto de vista do
  // cliente, não há nada de sensível em confirmar isso sem erro.
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
