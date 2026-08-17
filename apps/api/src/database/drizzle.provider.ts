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
    // Role restrita (não dona das tabelas, sem SUPERUSER/BYPASSRLS) — ver
    // comentário em env.validation.ts. DATABASE_URL (dono) fica só para
    // migrations, nunca para a conexão de runtime da API.
    const pool = new Pool({ connectionString: config.get('APP_DATABASE_URL', { infer: true }) });
    return drizzle(pool, { schema });
  },
};
