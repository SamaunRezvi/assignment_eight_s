import { Router, type Request, type Response } from "express";
import { collections } from "../../config/db.js";
import { currentUser, requireAuth } from "../../middleware/authenticate.js";
import { ApiError } from "../../utils/ApiError.js";
import { ok } from "../../utils/http.js";
import { toObjectId } from "../../utils/objectId.js";
import { toPublicStudio } from "../studios/studios.dto.js";

export const wishlistRouter = Router();
wishlistRouter.use(requireAuth);

/** Saved studios, newest save first. */
wishlistRouter.get("/", async (req: Request, res: Response) => {
  const saved = await collections.wishlists().find({ userId: currentUser(req).id }).sort({ createdAt: -1 }).toArray();
  const studios = await collections.studios().find({ _id: { $in: saved.map((item) => item.studioId) } }).toArray();
  const byId = new Map(studios.map((studio) => [studio._id.toString(), studio]));

  ok(
    res,
    saved.flatMap((item) => {
      const studio = byId.get(item.studioId.toString());
      return studio ? [toPublicStudio(studio)] : [];
    }),
  );
});

/** Only the ids, so studio cards can render their heart state cheaply. */
wishlistRouter.get("/ids", async (req: Request, res: Response) => {
  const saved = await collections.wishlists()
    .find({ userId: currentUser(req).id }, { projection: { studioId: 1 } })
    .toArray();
  ok(res, saved.map((item) => item.studioId.toString()));
});

wishlistRouter.put("/:studioId", async (req: Request, res: Response) => {
  const studioId = toObjectId(String(req.params.studioId), "studio id");
  const exists = await collections.studios().countDocuments({ _id: studioId }, { limit: 1 });
  if (!exists) throw ApiError.notFound("This studio could not be found");

  // Upsert keeps the call idempotent when the heart is tapped twice.
  await collections.wishlists().updateOne(
    { userId: currentUser(req).id, studioId },
    { $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  ok(res, { saved: true });
});

wishlistRouter.delete("/:studioId", async (req: Request, res: Response) => {
  await collections.wishlists().deleteOne({
    userId: currentUser(req).id,
    studioId: toObjectId(String(req.params.studioId), "studio id"),
  });
  ok(res, { saved: false });
});
