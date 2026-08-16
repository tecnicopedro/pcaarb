import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não definida');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.warn('Rodando migrations...');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  console.warn('Migrations concluídas.');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
