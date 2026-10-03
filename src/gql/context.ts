import type { Request } from 'express';
import { verifyAccessToken } from '@/lib/jwt';

export interface GraphQLContext {
  user: { id: string; role: 'owner' | 'accountant' } | null;
}

/** Same bearer-token contract as the REST API — one auth mechanism, two
 *  API shapes over it. A missing/invalid token yields `user: null` rather
 *  than throwing here, so schema introspection and public queries (none
 *  today, but the shape stays correct if one is added) are not blocked;
 *  every resolver that needs a user checks `context.user` itself. */
export function buildContext(req: Request): GraphQLContext {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return { user: null };
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    return { user: { id: payload.sub, role: payload.role } };
  } catch {
    return { user: null };
  }
}
