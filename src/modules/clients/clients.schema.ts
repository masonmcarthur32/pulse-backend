import { z } from 'zod';

export const CLIENT_STATUSES = ['active', 'paused', 'churned'] as const;

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contact: z.string().trim().max(300).optional().default(''),
  plan: z.string().trim().max(200).optional().default(''),
  status: z.enum(CLIENT_STATUSES).optional().default('active'),
  monthlyValueCents: z.number().int().min(0).max(1_000_000_000).optional().default(0),
  startDate: z.coerce.date().optional(),
  lastContact: z.coerce.date().optional(),
  notes: z.string().trim().max(4000).optional().default('')
});

// A PATCH-style update: every field optional, but whatever is present
// still has to pass the same rules as creation.
export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
