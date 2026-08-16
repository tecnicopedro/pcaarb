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
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type JwtPayload,
  type UpdateCategoryInput,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @CheckAbilities({ action: 'read', subject: 'Category' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.categoriesService.list(user.tenantId);
  }

  @CheckAbilities({ action: 'read', subject: 'Category' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findByIdOrThrow(user.tenantId, id);
  }

  @CheckAbilities({ action: 'create', subject: 'Category' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ) {
    return this.categoriesService.create(user.tenantId, body);
  }

  @CheckAbilities({ action: 'update', subject: 'Category' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.categoriesService.update(user.tenantId, id, body);
  }

  @CheckAbilities({ action: 'delete', subject: 'Category' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(user.tenantId, id);
  }
}
