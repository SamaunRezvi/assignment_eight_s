import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env, isProduction } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter, mutationLimiter, requireTrustedOrigin } from "./middleware/security.js";
import { apiRouter } from "./routes.js";

export function createApp() {
  const app = express();

  // Render/Vercel sit behind a single proxy; needed for correct client IPs in rate limiting.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
  );
  app.use(morgan(isProduction ? "combined" : "dev"));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use("/api", apiLimiter, requireTrustedOrigin, mutationLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
