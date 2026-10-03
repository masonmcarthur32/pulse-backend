import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/lib/asyncHandler';
import { idParamSchema } from '@/modules/finance/finance.schema';
import { createClientSchema, updateClientSchema } from '@/modules/clients/clients.schema';
import {
  listClientsHandler,
  createClientHandler,
  getClientHandler,
  updateClientHandler,
  deleteClientHandler
} from '@/modules/clients/clients.controller';

export const clientsRouter = Router();

clientsRouter.use(requireAuth);
clientsRouter.get('/', asyncHandler(listClientsHandler));
clientsRouter.post('/', validate(createClientSchema), asyncHandler(createClientHandler));
clientsRouter.get('/:id', validate(idParamSchema, 'params'), asyncHandler(getClientHandler));
clientsRouter.patch('/:id', validate(idParamSchema, 'params'), validate(updateClientSchema), asyncHandler(updateClientHandler));
clientsRouter.delete('/:id', validate(idParamSchema, 'params'), asyncHandler(deleteClientHandler));
