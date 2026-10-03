import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '@/db/client';

async function main() {
  // eslint-disable-next-line no-console
  console.log('Running database migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  // eslint-disable-next-line no-console
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err);
  process.exit(1);
});
