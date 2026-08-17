import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TrialExpiryService } from './trial-expiry.service';

@Module({
  providers: [TenantsService, TrialExpiryService],
  exports: [TenantsService, TrialExpiryService],
})
export class TenantsModule {}
