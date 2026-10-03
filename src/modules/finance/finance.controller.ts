import type { Request, Response } from 'express';
import * as financeService from '@/modules/finance/finance.service';

export async function createInvoiceHandler(req: Request, res: Response) {
  const invoice = await financeService.createInvoice(req.user!.id, req.body);
  res.status(201).json({ invoice });
}

export async function listInvoicesHandler(req: Request, res: Response) {
  const invoiceList = await financeService.listInvoices(req.user!.id);
  res.json({ invoices: invoiceList });
}

export async function markInvoicePaidHandler(req: Request, res: Response) {
  const invoice = await financeService.markInvoicePaid(req.user!.id, req.params.id as string);
  res.json({ invoice });
}

export async function deleteInvoiceHandler(req: Request, res: Response) {
  await financeService.deleteInvoice(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function dashboardSummaryHandler(req: Request, res: Response) {
  const summary = await financeService.getDashboardSummary(req.user!.id);
  res.json({ summary });
}

export async function createKpiHandler(req: Request, res: Response) {
  const kpi = await financeService.createKpi(req.user!.id, req.body);
  res.status(201).json({ kpi });
}

export async function listKpisHandler(req: Request, res: Response) {
  const kpiList = await financeService.listKpis(req.user!.id);
  res.json({ kpis: kpiList });
}
