import { Module } from '@nestjs/common';
import { DataPrivacyModule } from '../data-privacy/data-privacy.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [DataPrivacyModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
