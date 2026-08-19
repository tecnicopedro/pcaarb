import { Injectable, Logger } from '@nestjs/common';
import type { EmailProvider, SendInviteEmailParams, SendPasswordResetEmailParams } from './email-provider.interface';

/** Usado só em teste/dev sem credencial configurada — nunca em produção. */
@Injectable()
export class MockEmailProvider implements EmailProvider {
  private readonly logger = new Logger(MockEmailProvider.name);

  async sendInvite(params: SendInviteEmailParams): Promise<void> {
    this.logger.warn(`[mock] convite para ${params.to} (${params.role}): ${params.inviteUrl}`);
  }

  async sendPasswordReset(params: SendPasswordResetEmailParams): Promise<void> {
    this.logger.warn(`[mock] redefinição de senha para ${params.to}: ${params.resetUrl}`);
  }
}
