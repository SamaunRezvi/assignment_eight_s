import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { collections } from "../../config/db.js";
import { ok } from "../../utils/http.js";
import { parse } from "../../utils/validate.js";

const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address")),
});

const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many subscription attempts. Please try again later." },
});

export const newsletterRouter = Router();

newsletterRouter.post("/", subscribeLimiter, async (req: Request, res: Response) => {
  const { email } = parse(subscribeSchema, req.body);

  const result = await collections.subscribers().updateOne(
    { email },
    { $setOnInsert: { email, createdAt: new Date() } },
    { upsert: true },
  );
  ok(res, { alreadySubscribed: result.upsertedCount === 0 }, result.upsertedCount === 0 ? 200 : 201);
});
