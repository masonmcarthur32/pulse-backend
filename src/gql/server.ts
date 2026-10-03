import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import type { RequestHandler } from 'express';
import { typeDefs } from '@/gql/schema';
import { resolvers } from '@/gql/resolvers';
import { buildContext } from '@/gql/context';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * Returns Express middleware for the /graphql endpoint. Kept async because
 * ApolloServer.start() must complete before the middleware is used —
 * app.ts awaits this once at boot, not per-request.
 */
export async function createGraphQLMiddleware(): Promise<RequestHandler> {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // Field-level errors already carry a safe message + code (see
    // graphql/resolvers.ts `run`); an unexpected exception should not leak
    // its stack to the client even in a GraphQL error's `extensions`.
    formatError: (formattedError, error) => {
      if (env.NODE_ENV !== 'production') return formattedError;
      const code = formattedError.extensions?.code;
      if (code === 'UNAUTHENTICATED' || code === 'BAD_USER_INPUT') return formattedError;
      logger.error({ err: error }, 'Unhandled GraphQL error');
      return { message: 'Something went wrong on our end.', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
    },
    introspection: env.NODE_ENV !== 'production'
  });

  await server.start();

  return expressMiddleware(server, {
    context: async ({ req }) => buildContext(req)
  });
}
