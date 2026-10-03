import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { generalLimiter } from '@/middleware/rateLimiter';
import { notFoundHandler, errorHandler } from '@/middleware/errorHandler';
import { createGraphQLMiddleware } from '@/gql/server';
import { authRouter } from '@/modules/auth/auth.routes';
import { profileRouter } from '@/modules/profile/profile.routes';
import { financeRouter } from '@/modules/finance/finance.routes';
import { insightsRouter } from '@/modules/insights/insights.routes';
import { accountantRouter } from '@/modules/accountant/accountant.routes';
import { clientsRouter } from '@/modules/clients/clients.routes';
import { leadsRouter } from '@/modules/leads/leads.routes';

export async function buildApp(): Promise<Express> {
  const app = express();

  // Trust exactly one reverse-proxy hop (typical for a single load
  // balancer in front of this service) — needed so req.ip and
  // express-rate-limit see the real client IP instead of the proxy's.
  // Raise this only if there are genuinely more hops in front of the app.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: true },
      crossOriginResourcePolicy: { policy: 'same-site' }
    })
  );

  const allowedOrigins = new Set(env.CORS_ORIGINS);
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (server-to-server calls, curl, health checks)
        // is allowed through; browser requests are checked against the
        // explicit allowlist. There is no wildcard fallback — an empty
        // CORS_ORIGINS means no browser origin is trusted, by design.
        //
        // A disallowed origin resolves `false`, not an error: the request
        // still runs and gets its normal status code, but without an
        // Access-Control-Allow-Origin header — which is what actually
        // makes the browser discard the response. Erroring here instead
        // would turn every disallowed-origin request into a generic 500,
        // which is both misleading and a minor information leak (it
        // confirms the CORS check is what fired).
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true
    })
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(generalLimiter);

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/finance', financeRouter);
  app.use('/api/insights', insightsRouter);
  app.use('/api/accountant', accountantRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/leads', leadsRouter);

  const graphqlMiddleware = await createGraphQLMiddleware();
  app.use('/graphql', express.json({ limit: '100kb' }), graphqlMiddleware);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
