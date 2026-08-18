import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [UsersModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  // Exportado pro JwtAuthGuard (global, declarado em AppModule) conseguir
  // validar uma chave de API como forma alternativa de autenticação.
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
