import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { uploadLimiter } from "../../middleware/security.js";
import { ApiError } from "../../utils/ApiError.js";
import { ok } from "../../utils/http.js";

const MAX_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

const imgbbResponse = z.object({
  success: z.boolean(),
  data: z.object({ display_url: z.string().url(), url: z.string().url() }),
});

/** Validates the real file signature, because the client-declared mimetype is untrusted. */
function detectImageType(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

export const uploadsRouter = Router();

uploadsRouter.post(
  "/",
  requireAuth,
  uploadLimiter,
  upload.single("image"),
  async (req: Request, res: Response) => {
    if (!env.IMGBB_API_KEY) throw new ApiError(503, "Image uploads are not configured on this server");
    if (!req.file) throw ApiError.badRequest("Attach an image file in the 'image' field");

    const type = detectImageType(req.file.buffer);
    if (!type) throw ApiError.badRequest("Only JPEG, PNG or WebP images are allowed");

    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(req.file.buffer)], { type }), "upload");

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(env.IMGBB_API_KEY)}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new ApiError(502, "The image host rejected the upload. Please try again.");

    const parsed = imgbbResponse.safeParse(await response.json());
    if (!parsed.success || !parsed.data.success) {
      throw new ApiError(502, "The image host returned an unexpected response");
    }
    ok(res, { url: parsed.data.data.display_url }, 201);
  },
);
