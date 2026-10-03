import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/lib/asyncHandler';
import { idParamSchema } from '@/modules/finance/finance.schema';
import { createLeadSchema, updateLeadSchema, advanceLeadSchema } from '@/modules/leads/leads.schema';
import {
  listLeadsHandler,
  createLeadHandler,
  getLeadHandler,
  updateLeadHandler,
  deleteLeadHandler,
  advanceLeadHandler,
  reengageLeadHandler
} from '@/modules/leads/leads.controller';

export const leadsRouter = Router();

leadsRouter.use(requireAuth);
leadsRouter.get('/', asyncHandler(listLeadsHandler));
leadsRouter.post('/', validate(createLeadSchema), asyncHandler(createLeadHandler));
leadsRouter.get('/:id', validate(idParamSchema, 'params'), asyncHandler(getLeadHandler));
leadsRouter.patch('/:id', validate(idParamSchema, 'params'), validate(updateLeadSchema), asyncHandler(updateLeadHandler));
leadsRouter.delete('/:id', validate(idParamSchema, 'params'), asyncHandler(deleteLeadHandler));
leadsRouter.post(
  '/:id/advance',
  validate(idParamSchema, 'params'),
  validate(advanceLeadSchema),
  asyncHandler(advanceLeadHandler)
);
leadsRouter.post('/:id/reengage', validate(idParamSchema, 'params'), asyncHandler(reengageLeadHandler));
