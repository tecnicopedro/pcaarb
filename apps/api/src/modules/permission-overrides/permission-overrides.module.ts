import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PermissionOverridesController } from './permission-overrides.controller';
import { PermissionOverridesService } from './permission-overrides.service';

@Module({
  imports: [AuditLogModule],
  controllers: [PermissionOverridesController],
  providers: [PermissionOverridesService],
})
export class PermissionOverridesModule {}
