import type { ErrorRequestHandler, RequestHandler } from "express";
import { MongoServerError } from "mongodb";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { isProduction } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl.split("?")[0]} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ success: false, message: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    const fields = err.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }));
    res.status(400).json({ success: false, message: fields[0]?.message ?? "Validation failed", details: fields });
    return;
  }
  if (err instanceof MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller" : "Invalid file upload";
    res.status(400).json({ success: false, message });
    return;
  }
  if (err instanceof MongoServerError && err.code === 11000) {
    res.status(409).json({ success: false, message: "This record already exists" });
    return;
  }
  if (typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed") {
    res.status(400).json({ success: false, message: "Malformed JSON body" });
    return;
  }

  if (typeof err === "object" && err !== null && "type" in err && err.type === "entity.too.large") {
    res.status(413).json({ success: false, message: "The request body is too large" });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Something went wrong on our side. Please try again.",
    ...(isProduction ? {} : { stack: err instanceof Error ? err.stack : String(err) }),
  });
};
