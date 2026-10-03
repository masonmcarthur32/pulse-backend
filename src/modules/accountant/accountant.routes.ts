import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { accountantExportLimiter } from '@/middleware/rateLimiter';
import { idParamSchema } from '@/modules/finance/finance.schema';
import { z } from 'zod';
import { asyncHandler } from '@/lib/asyncHandler';
import {
  createLinkHandler,
  listLinksHandler,
  revokeLinkHandler,
  exportHandler
} from '@/modules/accountant/accountant.controller';

export const accountantRouter = Router();

// Owner-only: create/list/revoke share links. No accountant login exists —
// see docs/SECURITY.md for why a scoped link beats a shared account.
accountantRouter.post(
  '/links',
  requireAuth,
  requireRole('owner'),
  asyncHandler(createLinkHandler)
);
accountantRouter.get('/links', requireAuth, requireRole('owner'), asyncHandler(listLinksHandler));
accountantRouter.delete(
  '/links/:id',
  requireAuth,
  requireRole('owner'),
  validate(idParamSchema, 'params'),
  asyncHandler(revokeLinkHandler)
);

// Public, token-scoped, read-only — deliberately NOT behind requireAuth:
// the accountant has no Pulse account. The token itself is the
// credential; see accountant.service.ts for why invalid/expired/revoked
// all answer identically.
accountantRouter.get(
  '/export/:token',
  accountantExportLimiter,
  validate(z.object({ token: z.string().min(20).max(200) }), 'params'),
  asyncHandler(exportHandler)
);
