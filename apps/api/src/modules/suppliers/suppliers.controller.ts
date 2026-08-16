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
  createSupplierSchema,
  updateSupplierSchema,
  type CreateSupplierInput,
  type JwtPayload,
  type UpdateSupplierInput,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @CheckAbilities({ action: 'read', subject: 'Supplier' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.suppliersService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'read', subject: 'Supplier' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.findByIdOrThrow(user.tenantId, id);
  }

  @CheckAbilities({ action: 'create', subject: 'Supplier' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierInput,
  ) {
    return this.suppliersService.create(user.tenantId, body);
  }

  @CheckAbilities({ action: 'update', subject: 'Supplier' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierInput,
  ) {
    return this.suppliersService.update(user.tenantId, id, body);
  }

  @CheckAbilities({ action: 'delete', subject: 'Supplier' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.remove(user.tenantId, id);
  }
}
