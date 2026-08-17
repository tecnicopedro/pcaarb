export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface SendInviteEmailParams {
  to: string;
  companyName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}

/**
 * Abstração de envio de e-mail, mesmo padrão de PaymentProvider/FiscalProvider
 * (ver docs/03): o resto da aplicação fala com essa interface, nunca com o
 * SDK do provedor direto. Trocar de provedor é escrever um adapter novo.
 */
export interface EmailProvider {
  sendInvite(params: SendInviteEmailParams): Promise<void>;
}
