import type { Request, Response } from 'express';
import * as clientsService from '@/modules/clients/clients.service';
import { AppError } from '@/lib/http-error';

export async function listClientsHandler(req: Request, res: Response) {
  const clientList = await clientsService.listClients(req.user!.id);
  res.json({ clients: clientList });
}

export async function createClientHandler(req: Request, res: Response) {
  const client = await clientsService.createClient(req.user!.id, req.body);
  res.status(201).json({ client });
}

export async function getClientHandler(req: Request, res: Response) {
  const client = await clientsService.getClient(req.user!.id, req.params.id as string);
  if (!client) throw AppError.notFound('Client not found.', 'CLIENT_NOT_FOUND');
  res.json({ client });
}

export async function updateClientHandler(req: Request, res: Response) {
  const client = await clientsService.updateClient(req.user!.id, req.params.id as string, req.body);
  res.json({ client });
}

export async function deleteClientHandler(req: Request, res: Response) {
  await clientsService.deleteClient(req.user!.id, req.params.id as string);
  res.status(204).send();
}
