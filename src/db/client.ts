import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '@/config/env';
import * as schema from '@/db/schema';

/**
 * A single pooled connection, reused across the process. SSL is enabled
 * outside local development so traffic to a managed Postgres instance
 * (RDS, Neon, Supabase, etc.) is encrypted in transit.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  max: 10,
  idleTimeoutMillis: 30_000
});

pool.on('error', (err) => {
  // A background error on an idle client should not crash the process —
  // log it and let the pool recover the connection on next use.
  // eslint-disable-next-line no-console
  console.error('Unexpected database pool error', err);
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
