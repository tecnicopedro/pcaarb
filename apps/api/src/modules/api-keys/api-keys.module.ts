import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [UsersModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  // Exported so JwtAuthGuard (global, declared in AppModule) can validate
  // an API key as an alternative form of authentication.
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
