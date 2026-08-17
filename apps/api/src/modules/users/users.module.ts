import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [EmailModule, TenantsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
