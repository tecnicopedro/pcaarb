import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { CreateCashMovementInput, OpenCashSessionInput, CloseCashSessionInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  cashSessions,
  cashMovements,
  type CashSessionRow,
  type CashMovementRow,
} from '../../database/schema/index';

@Injectable()
export class CashSessionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findByIdOrThrow(tenantId: string, id: string): Promise<CashSessionRow> {
    const session = await runWithTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(cashSessions)
        .where(and(eq(cashSessions.id, id), eq(cashSessions.tenantId, tenantId)))
        .limit(1);
      return row;
    });
    if (!session) {
      throw new NotFoundException('Sessão de caixa não encontrada');
    }
    return session;
  }

  async getCurrentOpenSession(tenantId: string, userId: string): Promise<CashSessionRow | undefined> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.tenantId, tenantId),
            eq(cashSessions.openedBy, userId),
            eq(cashSessions.status, 'open'),
          ),
        )
        .orderBy(desc(cashSessions.openedAt))
        .limit(1);
      return row;
    });
  }

  async open(tenantId: string, userId: string, input: OpenCashSessionInput): Promise<CashSessionRow> {
    const existing = await this.getCurrentOpenSession(tenantId, userId);
    if (existing) {
      throw new ConflictException('Você já tem um caixa aberto. Feche-o antes de abrir outro.');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [session] = await tx
        .insert(cashSessions)
        .values({
          tenantId,
          openedBy: userId,
          openingAmountCents: input.openingAmountCents,
        })
        .returning();
      if (!session) {
        throw new Error('Falha ao abrir caixa');
      }
      return session;
    });
  }

  async close(
    tenantId: string,
    userId: string,
    id: string,
    input: CloseCashSessionInput,
  ): Promise<CashSessionRow> {
    const session = await this.findByIdOrThrow(tenantId, id);
    if (session.status === 'closed') {
      throw new ConflictException('Este caixa já está fechado');
    }
    if (session.openedBy !== userId) {
      throw new BadRequestException('Só quem abriu o caixa pode fechá-lo');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [updated] = await tx
        .update(cashSessions)
        .set({
          status: 'closed',
          closedBy: userId,
          closingAmountCents: input.closingAmountCents,
          closedAt: new Date(),
        })
        .where(and(eq(cashSessions.id, id), eq(cashSessions.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException('Sessão de caixa não encontrada');
      }
      return updated;
    });
  }

  async addMovement(
    tenantId: string,
    userId: string,
    cashSessionId: string,
    input: CreateCashMovementInput,
  ): Promise<CashMovementRow> {
    const session = await this.findByIdOrThrow(tenantId, cashSessionId);
    if (session.status === 'closed') {
      throw new ConflictException('Não é possível registrar movimentação em caixa fechado');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [movement] = await tx
        .insert(cashMovements)
        .values({
          tenantId,
          cashSessionId,
          type: input.type,
          amountCents: input.amountCents,
          reason: input.reason ?? null,
          createdBy: userId,
        })
        .returning();
      if (!movement) {
        throw new Error('Falha ao registrar movimentação de caixa');
      }
      return movement;
    });
  }

  async listMovements(tenantId: string, cashSessionId: string): Promise<CashMovementRow[]> {
    await this.findByIdOrThrow(tenantId, cashSessionId);
    return runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(cashMovements)
        .where(and(eq(cashMovements.cashSessionId, cashSessionId), eq(cashMovements.tenantId, tenantId)))
        .orderBy(desc(cashMovements.createdAt)),
    );
  }
}
