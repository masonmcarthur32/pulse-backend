import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/lib/asyncHandler';
import { businessProfileSchema } from '@/modules/profile/profile.schema';
import { getMyProfile, upsertMyProfile } from '@/modules/profile/profile.controller';

export const profileRouter = Router();

profileRouter.use(requireAuth);
profileRouter.get('/', asyncHandler(getMyProfile));
profileRouter.put('/', validate(businessProfileSchema), asyncHandler(upsertMyProfile));
