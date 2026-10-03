import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/lib/asyncHandler';
import { createInvoiceSchema, kpiSchema, idParamSchema } from '@/modules/finance/finance.schema';
import {
  createInvoiceHandler,
  listInvoicesHandler,
  markInvoicePaidHandler,
  dashboardSummaryHandler,
  createKpiHandler,
  listKpisHandler
} from '@/modules/finance/finance.controller';

export const financeRouter = Router();

financeRouter.use(requireAuth);

financeRouter.get('/dashboard-summary', asyncHandler(dashboardSummaryHandler));

financeRouter.get('/invoices', asyncHandler(listInvoicesHandler));
financeRouter.post('/invoices', validate(createInvoiceSchema), asyncHandler(createInvoiceHandler));
financeRouter.post(
  '/invoices/:id/mark-paid',
  validate(idParamSchema, 'params'),
  asyncHandler(markInvoicePaidHandler)
);

financeRouter.get('/kpis', asyncHandler(listKpisHandler));
financeRouter.post('/kpis', validate(kpiSchema), asyncHandler(createKpiHandler));
