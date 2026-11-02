import type { Request, Response } from "express";
import { currentUser } from "../../middleware/authenticate.js";
import { ok, page } from "../../utils/http.js";
import { parse } from "../../utils/validate.js";
import { toOwnedStudio, toPublicStudio } from "./studios.dto.js";
import {
  featuredQuerySchema,
  listStudiosQuerySchema,
  studioInputSchema,
} from "./studios.schema.js";
import * as studios from "./studios.service.js";

export async function list(req: Request, res: Response) {
  const query = parse(listStudiosQuerySchema, req.query);
  const { items, total } = await studios.listStudios(query);
  page(res, items.map(toPublicStudio), { total, page: query.page, limit: query.limit });
}

export async function featured(req: Request, res: Response) {
  const { limit } = parse(featuredQuerySchema, req.query);
  const items = await studios.listFeaturedStudios(limit);
  ok(res, items.map(toPublicStudio));
}

export async function cities(_req: Request, res: Response) {
  ok(res, await studios.listStudioCities());
}

export async function mine(req: Request, res: Response) {
  const user = currentUser(req);
  const items = await studios.listStudiosByOwner(user.id);
  ok(res, items.map(toOwnedStudio));
}

export async function detail(req: Request, res: Response) {
  const studio = await studios.getStudioOrThrow(String(req.params.id));
  const isOwner = req.user?.id === studio.ownerId;
  ok(res, isOwner ? toOwnedStudio(studio) : toPublicStudio(studio));
}

export async function create(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parse(studioInputSchema, req.body);
  const studio = await studios.createStudio(user, input);
  ok(res, toOwnedStudio(studio), 201);
}

export async function update(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parse(studioInputSchema, req.body);
  const studio = await studios.updateStudio(user, String(req.params.id), input);
  ok(res, toOwnedStudio(studio));
}

export async function remove(req: Request, res: Response) {
  const user = currentUser(req);
  await studios.deleteStudio(user, String(req.params.id));
  ok(res, { deleted: true });
}
