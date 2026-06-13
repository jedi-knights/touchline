/**
 * Apply pending Drizzle migrations. Used by `npm run db:migrate` and by the
 * Docker entrypoint on container start.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required to run migrations');
  process.exit(1);
}

// Suppress NOTICE chatter from idempotent CREATE ... IF NOT EXISTS statements
// — these are not errors and just clutter container logs on re-runs.
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(sql);

console.log('[touchline] running migrations...');
await migrate(db, { migrationsFolder: './src/db/migrations' });
console.log('[touchline] migrations complete');
await sql.end();
