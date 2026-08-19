import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
// Import de valor: necessário para o NestJS injetar via emitDecoratorMetadata.
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { and, eq, isNull } from 'drizzle-orm';
import type { AcceptInviteInput, InviteUserInput, Role } from '@pcaarb/shared';
import type { Env } from '../../config/env.validation';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { refreshTokens, tenants, userInvites, users, type NewUserRow, type UserInviteRow, type UserRow } from '../../database/schema/index';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email-provider.interface';

const BCRYPT_ROUNDS = 12;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    private readonly config: ConfigService<Env, true>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async findById(id: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  // Chamado pelo AuthService a cada tentativa de login com senha errada —
  // mas só até a conta bloquear: uma vez bloqueada, `AuthService.login()`
  // rejeita antes mesmo de chegar aqui (checagem de `lockedUntil` acontece
  // antes da senha decidir a resposta, ver comentário lá — achado de
  // revisão de segurança, 2026-08-19), então o bloqueio expira sozinho depois
  // de LOGIN_LOCKOUT_MS, sem ser estendido por tentativas subsequentes.
  async registerFailedLogin(user: UserRow): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const justLocked = attempts === LOGIN_LOCKOUT_THRESHOLD;
    const lockedUntil = justLocked ? new Date(Date.now() + LOGIN_LOCKOUT_MS) : user.lockedUntil;
    await this.db.update(users).set({ failedLoginAttempts: attempts, lockedUntil }).where(eq(users.id, user.id));
    if (justLocked) {
      await this.auditLogService.record({
        tenantId: user.tenantId,
        actorUserId: null,
        action: 'auth.account_locked',
        targetType: 'User',
        targetId: user.id,
        metadata: { failedLoginAttempts: attempts },
      });
    }
  }

  // Chamado em todo login bem-sucedido — zera o contador pra não acumular
  // "quase bloqueios" de tentativas erradas espaçadas ao longo do tempo.
  async clearLoginLockout(userId: string): Promise<void> {
    await this.db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
  }

  async create(data: NewUserRow): Promise<UserRow> {
    const [user] = await this.db.insert(users).values(data).returning();
    if (!user) {
      throw new Error('Falha ao criar usuário');
    }
    return user;
  }

  // Exclui contas de serviço (chaves de API, ver api-keys.schema.ts) — essa
  // listagem alimenta a tela de Usuários e seletores de vendedor, feitos
  // pra gente de verdade; a chave de API tem sua própria tela em
  // /painel/integracoes.
  async listByTenant(tenantId: string): Promise<UserRow[]> {
    return this.db.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.isServiceAccount, false)));
  }

  async listPendingInvites(tenantId: string): Promise<UserInviteRow[]> {
    return this.db
      .select()
      .from(userInvites)
      .where(and(eq(userInvites.tenantId, tenantId), isNull(userInvites.acceptedAt)));
  }

  async updateRole(tenantId: string, actingRole: Role, targetUserId: string, newRole: Role): Promise<UserRow> {
    const [target] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.tenantId, tenantId)))
      .limit(1);
    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (newRole === 'owner' && actingRole !== 'owner') {
      throw new ForbiddenException('Só um owner pode promover outro usuário a owner');
    }

    if (target.role === 'owner' && newRole !== 'owner') {
      if (actingRole !== 'owner') {
        throw new ForbiddenException('Só um owner pode alterar o papel de outro owner');
      }
      const owners = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.role, 'owner')));
      if (owners.length <= 1) {
        throw new ConflictException('O tenant precisa de ao menos um owner — promova outro antes de rebaixar este');
      }
    }

    const [updated] = await this.db.update(users).set({ role: newRole }).where(eq(users.id, targetUserId)).returning();
    if (!updated) {
      throw new Error('Falha ao atualizar papel do usuário');
    }
    return updated;
  }

  // Nunca DELETE físico — um usuário tem FK em vendas/estoque/caixa/
  // auditoria por todo canto, apagar destruiria histórico de negócio (mesmo
  // racional de products.active/stores.active). Login fica bloqueado pra
  // `active=false` (ver AuthService.login). Sem reativação nesta fatia —
  // mesmo escopo mínimo de revokeInvite, que também não tem "desfazer".
  async deactivate(tenantId: string, actingUserId: string, actingRole: Role, targetUserId: string): Promise<UserRow> {
    if (targetUserId === actingUserId) {
      throw new BadRequestException('Você não pode desativar sua própria conta — peça pra outro administrador fazer isso');
    }

    const [target] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.tenantId, tenantId)))
      .limit(1);
    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (!target.active) {
      throw new ConflictException('Usuário já está desativado');
    }

    if (target.role === 'owner') {
      if (actingRole !== 'owner') {
        throw new ForbiddenException('Só um owner pode desativar outro owner');
      }
      const owners = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.role, 'owner'), eq(users.active, true)));
      if (owners.length <= 1) {
        throw new ConflictException('O tenant precisa de ao menos um owner ativo — promova outro antes de desativar este');
      }
    }

    // Revoga as sessões existentes na mesma transação — achado de revisão de
    // segurança (2026-08-19): sem isso, um refresh token emitido antes da
    // desativação continuava funcionando pra sempre via POST /auth/refresh
    // (cada chamada rotaciona pra um token novo de mais 7 dias), porque só
    // AuthService.login() checava `active` — refresh nunca checava. Mesmo
    // padrão já usado em AuthService.resetPassword() pro mesmo motivo.
    return this.db.transaction(async (tx) => {
      const [updated] = await tx.update(users).set({ active: false }).where(eq(users.id, targetUserId)).returning();
      if (!updated) {
        throw new Error('Falha ao desativar usuário');
      }
      await tx.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, targetUserId));
      return updated;
    });
  }

  async inviteUser(
    tenantId: string,
    inviter: { id: string; name: string; role: Role },
    input: InviteUserInput,
  ): Promise<UserInviteRow> {
    if (input.role === 'owner' && inviter.role !== 'owner') {
      throw new ForbiddenException('Só um owner pode convidar outro usuário como owner');
    }

    const existingUser = await this.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }

    const [pendingInvite] = await this.db
      .select({ id: userInvites.id })
      .from(userInvites)
      .where(
        and(eq(userInvites.tenantId, tenantId), eq(userInvites.email, input.email), isNull(userInvites.acceptedAt)),
      )
      .limit(1);
    if (pendingInvite) {
      throw new ConflictException('Já existe um convite pendente para este e-mail');
    }

    const [tenant] = await this.db.select({ companyName: tenants.companyName }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    // Convite sem e-mail entregue não serve pra nada — se o envio falhar, o
    // registro do convite é desfeito junto (nada de linha "fantasma" que o
    // convidado nunca vai saber que existe e que bloqueia reenvio).
    return this.db.transaction(async (tx) => {
      const [invite] = await tx
        .insert(userInvites)
        .values({
          tenantId,
          email: input.email,
          role: input.role,
          tokenHash,
          invitedByUserId: inviter.id,
          expiresAt,
        })
        .returning();
      if (!invite) {
        throw new Error('Falha ao criar convite');
      }

      const inviteUrl = `${this.config.get('CORS_ORIGIN', { infer: true })}/aceitar-convite?id=${invite.id}&token=${rawToken}`;
      await this.emailProvider.sendInvite({
        to: input.email,
        companyName: tenant.companyName,
        inviterName: inviter.name,
        role: input.role,
        inviteUrl,
      });

      return invite;
    });
  }

  async revokeInvite(tenantId: string, inviteId: string): Promise<void> {
    const [invite] = await this.db
      .select({ id: userInvites.id, acceptedAt: userInvites.acceptedAt })
      .from(userInvites)
      .where(and(eq(userInvites.id, inviteId), eq(userInvites.tenantId, tenantId)))
      .limit(1);
    if (!invite) {
      throw new NotFoundException('Convite não encontrado');
    }
    if (invite.acceptedAt) {
      throw new ConflictException('Convite já foi aceito');
    }
    await this.db.delete(userInvites).where(eq(userInvites.id, inviteId));
  }

  async acceptInvite(input: AcceptInviteInput): Promise<UserRow> {
    return this.db.transaction(async (tx) => {
      const [invite] = await tx.select().from(userInvites).where(eq(userInvites.id, input.inviteId)).limit(1);
      if (!invite) {
        throw new NotFoundException('Convite não encontrado');
      }
      if (invite.acceptedAt) {
        throw new ConflictException('Este convite já foi utilizado');
      }
      if (invite.expiresAt < new Date()) {
        throw new GoneException('Este convite expirou — peça um novo');
      }

      const tokenMatches = await bcrypt.compare(input.token, invite.tokenHash);
      if (!tokenMatches) {
        throw new UnauthorizedException('Convite inválido');
      }

      const [existingUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, invite.email)).limit(1);
      if (existingUser) {
        throw new BadRequestException('Já existe uma conta com este e-mail');
      }

      const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
      const [user] = await tx
        .insert(users)
        .values({
          tenantId: invite.tenantId,
          name: input.name,
          email: invite.email,
          passwordHash,
          role: invite.role,
        })
        .returning();
      if (!user) {
        throw new Error('Falha ao criar usuário a partir do convite');
      }

      await tx.update(userInvites).set({ acceptedAt: new Date() }).where(eq(userInvites.id, invite.id));

      return user;
    });
  }
}
