import { z } from 'zod';

export const createInvoiceSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  amountCents: z.number().int().positive().max(1_000_000_000),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3)
    .optional()
    .default('AUD'),
  dueAt: z.coerce.date()
});

export const kpiSchema = z.object({
  goal: z.string().trim().min(1).max(300),
  keyResult: z.string().trim().min(1).max(300),
  kpiName: z.string().trim().min(1).max(200),
  dataSource: z.string().trim().max(200).optional().default(''),
  currentValue: z.string().trim().max(100).optional().default(''),
  targetValue: z.string().trim().max(100).optional().default('')
});

export const idParamSchema = z.object({
  id: z.string().uuid()
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type KpiInput = z.infer<typeof kpiSchema>;
