import type { Request, Response } from 'express';
import * as accountantService from '@/modules/accountant/accountant.service';
import { AppError } from '@/lib/http-error';

export async function createLinkHandler(req: Request, res: Response) {
  const link = await accountantService.createAccountantLink(req.user!.id);
  res.status(201).json({ link });
}

export async function listLinksHandler(req: Request, res: Response) {
  const links = await accountantService.listAccountantLinks(req.user!.id);
  res.json({ links });
}

export async function revokeLinkHandler(req: Request, res: Response) {
  await accountantService.revokeAccountantLink(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function exportHandler(req: Request, res: Response) {
  const data = await accountantService.resolveAccountantExport(req.params.token as string);
  if (!data) throw AppError.notFound('This link is invalid, expired, or has been revoked.', 'LINK_INVALID');
  res.json(data);
}
