import { z } from 'zod';

/**
 * Password policy: length over cleverness. NIST 800-63B recommends a
 * minimum length and checking against known-breached lists over forced
 * complexity rules (which push users toward predictable substitutions).
 * A breached-password check belongs at the infra layer (e.g. an
 * HaveIBeenPwned range query) — left as a documented follow-up in
 * docs/SECURITY.md rather than faked here.
 */
export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(12, 'Password must be at least 12 characters').max(200)
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200)
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
