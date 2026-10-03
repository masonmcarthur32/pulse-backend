import type { Request, Response } from 'express';
import * as profileService from '@/modules/profile/profile.service';
import { AppError } from '@/lib/http-error';

export async function getMyProfile(req: Request, res: Response) {
  const profile = await profileService.getProfile(req.user!.id);
  if (!profile) throw AppError.notFound('No business profile yet.', 'PROFILE_NOT_FOUND');
  res.json({ profile });
}

export async function upsertMyProfile(req: Request, res: Response) {
  const profile = await profileService.upsertProfile(req.user!.id, req.body);
  res.json({ profile });
}
