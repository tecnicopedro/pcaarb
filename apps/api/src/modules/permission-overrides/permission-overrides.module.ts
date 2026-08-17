import { Module } from '@nestjs/common';
import { PermissionOverridesController } from './permission-overrides.controller';
import { PermissionOverridesService } from './permission-overrides.service';

@Module({
  controllers: [PermissionOverridesController],
  providers: [PermissionOverridesService],
})
export class PermissionOverridesModule {}
