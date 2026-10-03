import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail fast, at boot, if configuration is missing or malformed — never at
 * the moment a request first needs a secret. A misconfigured deployment
 * should refuse to start rather than run with an empty JWT secret.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  // No JWT_REFRESH_SECRET on purpose: refresh tokens are opaque random
  // strings (lib/jwt.ts generateRefreshToken), not JWTs — only their
  // SHA-256 hash is ever compared, so there is nothing to sign or verify
  // and no secret for one to protect. A previous version of this schema
  // required one that no code ever read; that's removed rather than kept
  // as a config value that implied a security property the system didn't
  // actually have.
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  ACCOUNTANT_LINK_TTL_HOURS: z.coerce.number().int().positive().default(72)
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Refusing to start with invalid environment configuration.');
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
