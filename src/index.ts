import { buildApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { pool } from '@/db/client';

async function main() {
  const app = await buildApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`business-os-backend listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  async function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    // Force-exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
