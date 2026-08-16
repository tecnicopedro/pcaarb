import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://pcaarb:pcaarb@localhost:5433/pcaarb',
  },
  strict: true,
  verbose: true,
});
