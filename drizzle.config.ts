import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://business_os:changeme@localhost:5432/business_os'
  },
  strict: true,
  verbose: true
} satisfies Config;
