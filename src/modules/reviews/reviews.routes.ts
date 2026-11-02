import { Router, type Request, type Response } from "express";
import { currentUser, requireAuth } from "../../middleware/authenticate.js";
import { ok } from "../../utils/http.js";
import { parse } from "../../utils/validate.js";
import * as reviews from "./reviews.service.js";

export const reviewsRouter = Router();

reviewsRouter.get("/studios/:studioId/reviews", async (req: Request, res: Response) => {
  const items = await reviews.listReviews(String(req.params.studioId));
  ok(res, items.map(reviews.toReviewDto));
});

reviewsRouter.post("/studios/:studioId/reviews", requireAuth, async (req: Request, res: Response) => {
  const input = parse(reviews.reviewInputSchema, req.body);
  const review = await reviews.createReview(currentUser(req), String(req.params.studioId), input);
  ok(res, reviews.toReviewDto(review), 201);
});

reviewsRouter.delete("/reviews/:id", requireAuth, async (req: Request, res: Response) => {
  await reviews.deleteReview(currentUser(req), String(req.params.id));
  ok(res, { deleted: true });
});
