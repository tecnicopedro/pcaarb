import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Public()
  @Get()
  async check() {
    await this.db.execute(sql`SELECT 1`);
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
