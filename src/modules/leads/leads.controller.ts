import type { Request, Response } from 'express';
import * as leadsService from '@/modules/leads/leads.service';
import { AppError } from '@/lib/http-error';

export async function listLeadsHandler(req: Request, res: Response) {
  const stageQuery = req.query.stage;
  if (stageQuery === 'pipeline') {
    return res.json({ leads: await leadsService.pipelineLeads(req.user!.id) });
  }
  if (stageQuery === 'lost') {
    return res.json({ leads: await leadsService.followUpLeads(req.user!.id) });
  }
  return res.json({ leads: await leadsService.listLeads(req.user!.id) });
}

export async function createLeadHandler(req: Request, res: Response) {
  const lead = await leadsService.createLead(req.user!.id, req.body);
  res.status(201).json({ lead });
}

export async function getLeadHandler(req: Request, res: Response) {
  const lead = await leadsService.getLead(req.user!.id, req.params.id as string);
  if (!lead) throw AppError.notFound('Lead not found.', 'LEAD_NOT_FOUND');
  res.json({ lead });
}

export async function updateLeadHandler(req: Request, res: Response) {
  const lead = await leadsService.updateLead(req.user!.id, req.params.id as string, req.body);
  res.json({ lead });
}

export async function deleteLeadHandler(req: Request, res: Response) {
  await leadsService.deleteLead(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function advanceLeadHandler(req: Request, res: Response) {
  const result = await leadsService.advanceLead(req.user!.id, req.params.id as string, req.body.nextStage);
  res.json(result);
}

export async function reengageLeadHandler(req: Request, res: Response) {
  const lead = await leadsService.reengageLead(req.user!.id, req.params.id as string);
  res.json({ lead });
}
