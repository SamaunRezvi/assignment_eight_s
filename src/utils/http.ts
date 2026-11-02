import type { Response } from "express";

export function ok<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ success: true, data });
}

export function page<T>(
  res: Response,
  items: T[],
  meta: { total: number; page: number; limit: number },
) {
  res.json({
    success: true,
    data: items,
    meta: { ...meta, totalPages: Math.max(1, Math.ceil(meta.total / meta.limit)) },
  });
}
