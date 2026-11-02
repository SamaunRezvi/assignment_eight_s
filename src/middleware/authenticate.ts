import type { NextFunction, Request, Response } from "express";
import { jwtVerify } from "jose";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import type { AuthUser } from "../types/models.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

async function readUser(req: Request): Promise<AuthUser | null> {
  const token: unknown = req.cookies?.[env.AUTH_COOKIE_NAME];
  if (typeof token !== "string" || token.length === 0) return null;

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "studiospace",
      audience: "studiospace-api",
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
      image: typeof payload.picture === "string" ? payload.picture : "",
    };
  } catch {
    return null;
  }
}

/** Rejects the request with 401 unless a valid HTTPOnly JWT cookie is present. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await readUser(req);
  if (!user) throw ApiError.unauthorized();
  req.user = user;
  next();
}

/** Attaches the user when a valid token exists, but never blocks the request. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await readUser(req);
  if (user) req.user = user;
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
