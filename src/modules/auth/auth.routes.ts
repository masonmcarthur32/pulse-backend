import { Router } from 'express';
import { validate } from '@/middleware/validate';
import { authLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/lib/asyncHandler';
import { signupSchema, loginSchema } from '@/modules/auth/auth.schema';
import {
  signupHandler,
  loginHandler,
  refreshHandler,
  logoutHandler
} from '@/modules/auth/auth.controller';

export const authRouter = Router();

authRouter.post('/signup', authLimiter, validate(signupSchema), asyncHandler(signupHandler));
authRouter.post('/login', authLimiter, validate(loginSchema), asyncHandler(loginHandler));
authRouter.post('/refresh', authLimiter, asyncHandler(refreshHandler));
authRouter.post('/logout', asyncHandler(logoutHandler));
