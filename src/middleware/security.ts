import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated mutations: browsers always send an Origin
 * header on cross-site writes, so any unsafe request must come from an allowed origin.
 */
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (origin && !env.CLIENT_ORIGIN.includes(origin)) {
    return next(ApiError.forbidden("Request origin is not allowed"));
  }
  next();
};

const limiterMessage = { success: false, message: "Too many requests. Please slow down and try again shortly." };

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: limiterMessage,
});

export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => SAFE_METHODS.has(req.method),
  message: limiterMessage,
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: limiterMessage,
});
