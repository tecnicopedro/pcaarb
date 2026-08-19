import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type JwtPayload,
  type UpdateCustomerInput,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @CheckAbilities({ action: 'read', subject: 'Customer' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.customersService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'read', subject: 'Customer' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findByIdOrThrow(user.tenantId, id);
  }

  @CheckAbilities({ action: 'create', subject: 'Customer' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
  ) {
    return this.customersService.create(user.tenantId, body);
  }

  @CheckAbilities({ action: 'update', subject: 'Customer' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
  ) {
    return this.customersService.update(user.tenantId, id, body);
  }

  @CheckAbilities({ action: 'delete', subject: 'Customer' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.remove(user.tenantId, id, user.sub);
  }
}
