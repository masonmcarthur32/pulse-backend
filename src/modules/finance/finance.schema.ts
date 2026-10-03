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
  dueAt: z.coerce.date(),
  notes: z.string().trim().max(4000).optional().default('')
});

// A PATCH-style update: every field optional, but whatever is present
// still has to pass the same rules as creation. Deliberately does NOT
// include `status` — status only ever changes through the dedicated
// mark-paid action (or a future void action), never a free-form edit, so
// there is no way to PATCH an invoice back to "pending" after paying it
// or vice versa by accident.
export const updateInvoiceSchema = createInvoiceSchema.partial();

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
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type KpiInput = z.infer<typeof kpiSchema>;
