import { z } from 'zod';

export const LEAD_STAGES = ['new', 'contacted', 'proposal_sent', 'won', 'lost'] as const;

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contact: z.string().trim().max(300).optional().default(''),
  source: z.string().trim().max(200).optional().default(''),
  stage: z.enum(LEAD_STAGES).optional().default('new'),
  estValueCents: z.number().int().min(0).max(1_000_000_000).optional().default(0),
  lastContact: z.coerce.date().optional(),
  followUpDate: z.coerce.date().optional(),
  lostReason: z.string().trim().max(300).optional().default(''),
  notes: z.string().trim().max(4000).optional().default('')
});

export const updateLeadSchema = createLeadSchema.partial();

export const advanceLeadSchema = z.object({
  nextStage: z.enum(LEAD_STAGES)
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
