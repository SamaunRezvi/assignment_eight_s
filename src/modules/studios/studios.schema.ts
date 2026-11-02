import { z } from "zod";
import { STUDIO_CATEGORIES } from "../../types/models.js";

export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a valid http(s) URL");

export const studioInputSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(100),
  category: z.enum(STUDIO_CATEGORIES, { error: "Choose a valid studio category" }),
  hourlyRate: z.coerce.number().min(1, "Hourly rate must be at least $1").max(10_000),
  securityDeposit: z.coerce.number().min(0, "Deposit cannot be negative").max(100_000),
  maxCapacity: z.coerce.number().int("Capacity must be a whole number").min(1).max(500),
  location: z.object({
    address: z.string().trim().min(5, "Enter the full street address").max(200),
    city: z.string().trim().min(2, "Enter the city").max(80),
  }),
  image: httpUrl,
  gallery: z.array(httpUrl).max(6, "You can add up to 6 gallery images").default([]),
  amenities: z
    .array(z.string().trim().min(1).max(40))
    .max(20, "You can add up to 20 amenities")
    .default([])
    .transform((items) => [...new Set(items)]),
  overview: z.string().trim().min(20, "Overview must be at least 20 characters").max(3000),
});
export type StudioInput = z.infer<typeof studioInputSchema>;

export const studioSortValues = ["newest", "top-rated", "price-asc", "price-desc"] as const;

export const listStudiosQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(STUDIO_CATEGORIES).optional(),
  city: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  capacity: z.coerce.number().int().min(1).optional(),
  sort: z.enum(studioSortValues).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});
export type ListStudiosQuery = z.infer<typeof listStudiosQuerySchema>;

export const featuredQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(6),
});
