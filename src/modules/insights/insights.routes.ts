import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { aiLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/lib/asyncHandler';
import { generateInsightsHandler, getLatestInsightHandler } from '@/modules/insights/insights.controller';

export const insightsRouter = Router();

insightsRouter.use(requireAuth);
insightsRouter.get('/latest', asyncHandler(getLatestInsightHandler));
insightsRouter.post('/generate', aiLimiter, asyncHandler(generateInsightsHandler));
