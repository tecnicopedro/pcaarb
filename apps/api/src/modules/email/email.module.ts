import { Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email-provider.interface';
import { ResendEmailProvider } from './resend-email.provider';

@Module({
  providers: [{ provide: EMAIL_PROVIDER, useClass: ResendEmailProvider }],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
