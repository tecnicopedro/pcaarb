import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index';
import type { Env } from '../config/env.validation';

export const DRIZZLE = Symbol('DRIZZLE');

export type Database = NodePgDatabase<typeof schema>;

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): Database => {
    // Restricted role (not the table owner, no SUPERUSER/BYPASSRLS) — see the
    // comment in env.validation.ts. DATABASE_URL (the owner) stays reserved
    // for migrations, never for the API's runtime connection.
    const pool = new Pool({ connectionString: config.get('APP_DATABASE_URL', { infer: true }) });
    return drizzle(pool, { schema });
  },
};
