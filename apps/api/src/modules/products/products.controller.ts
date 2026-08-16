import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type JwtPayload,
  type UpdateProductInput,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @CheckAbilities({ action: 'read', subject: 'Product' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.productsService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'read', subject: 'Product' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findByIdOrThrow(user.tenantId, id);
  }

  @CheckAbilities({ action: 'create', subject: 'Product' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
  ) {
    return this.productsService.create(user.tenantId, body);
  }

  @CheckAbilities({ action: 'update', subject: 'Product' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
  ) {
    return this.productsService.update(user.tenantId, id, body);
  }
}
