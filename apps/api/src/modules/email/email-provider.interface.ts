export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface SendInviteEmailParams {
  to: string;
  companyName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}

export interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
}

/**
 * Email-sending abstraction, same pattern as PaymentProvider/FiscalProvider
 * (see docs/03): the rest of the application talks to this interface, never
 * directly to the provider's SDK. Switching providers is writing one new
 * adapter.
 */
export interface EmailProvider {
  sendInvite(params: SendInviteEmailParams): Promise<void>;
  sendPasswordReset(params: SendPasswordResetEmailParams): Promise<void>;
}
