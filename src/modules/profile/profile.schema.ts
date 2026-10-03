import { z } from 'zod';

export const BUSINESS_MODELS = [
  'Service / coaching',
  'Subscription',
  'One-time product sales',
  'Hybrid'
] as const;

export const ACCOUNTING_SOFTWARE = ['Xero', 'MYOB', 'QuickBooks', 'Other', 'None yet'] as const;

export const businessProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  model: z.enum(BUSINESS_MODELS),
  idealCustomer: z.string().trim().max(2000).optional().default(''),
  quarterlyGoal: z.string().trim().max(300).optional().default(''),
  accountingSoftware: z.enum(ACCOUNTING_SOFTWARE).optional().default('None yet')
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
