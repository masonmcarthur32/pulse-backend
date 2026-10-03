import type { Request, Response } from 'express';
import * as insightsService from '@/modules/insights/insights.service';

export async function generateInsightsHandler(req: Request, res: Response) {
  const result = await insightsService.generateInsights(req.user!.id);
  res.status(201).json(result);
}

export async function getLatestInsightHandler(req: Request, res: Response) {
  const latest = await insightsService.getLatestInsight(req.user!.id);
  res.json({ insight: latest ?? null });
}
