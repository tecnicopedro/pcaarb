import { Inject, Injectable } from '@nestjs/common';
// Import de valor: necessário para o NestJS injetar via emitDecoratorMetadata.
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../../config/env.validation';
import type { EmailProvider, SendInviteEmailParams } from './email-provider.interface';

// inviterName/companyName vêm de texto livre do usuário (nome no cadastro,
// nome da empresa) — sem escape, dá pra injetar HTML no e-mail de convite.
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
}
