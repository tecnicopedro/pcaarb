import { Inject, Injectable } from '@nestjs/common';
// Value import: required for NestJS to inject via emitDecoratorMetadata.
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../../config/env.validation';
import type { EmailProvider, SendInviteEmailParams, SendPasswordResetEmailParams } from './email-provider.interface';

// inviterName/companyName come from free-text user input (name at signup,
// company name) — without escaping, HTML could be injected into the invite email.
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;
  private readonly fromEmail: string;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.client = new Resend(config.get('RESEND_API_KEY', { infer: true }));
    this.fromEmail = config.get('RESEND_FROM_EMAIL', { infer: true });
  }

  async sendInvite(params: SendInviteEmailParams): Promise<void> {
    const inviterName = escapeHtml(params.inviterName);
    const companyName = escapeHtml(params.companyName);
    const { error } = await this.client.emails.send({
      from: this.fromEmail,
      to: params.to,
      subject: `${params.inviterName} te convidou para o time da ${params.companyName} no PCAARB`,
      html: `
        <p>Olá,</p>
        <p><strong>${inviterName}</strong> te convidou para acessar o PCAARB da <strong>${companyName}</strong> como <strong>${params.role}</strong>.</p>
        <p><a href="${params.inviteUrl}">Clique aqui para aceitar o convite e criar sua senha</a></p>
        <p>Se você não esperava este e-mail, pode ignorá-lo.</p>
      `,
    });
    if (error) {
      throw new Error(`Falha ao enviar e-mail de convite via Resend: ${error.message}`);
    }
  }

  // resetUrl is built only from CORS_ORIGIN (config) + server-generated
  // id/token — no free-text user input goes in here, so it doesn't need
  // the escapeHtml used in sendInvite (inviterName/companyName).
  async sendPasswordReset(params: SendPasswordResetEmailParams): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromEmail,
      to: params.to,
      subject: 'Redefinir sua senha do PCAARB',
      html: `
        <p>Olá,</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta no PCAARB.</p>
        <p><a href="${params.resetUrl}">Clique aqui para escolher uma nova senha</a></p>
        <p>Este link expira em 1 hora. Se você não pediu essa redefinição, pode ignorar este e-mail — sua senha continua a mesma.</p>
      `,
    });
    if (error) {
      throw new Error(`Falha ao enviar e-mail de redefinição de senha via Resend: ${error.message}`);
    }
  }
}
