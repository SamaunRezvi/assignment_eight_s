import { z } from "zod";
import { BOOKING_STATUSES } from "../../types/models.js";

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|30)$/, "Time must be on the hour or half hour (HH:mm)");

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, "Choose a valid date");

export const createBookingSchema = z.object({
  studioId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid studio id"),
  date: calendarDate,
  startTime: timeOfDay,
  endTime: timeOfDay,
  guests: z.coerce.number().int("Guests must be a whole number").min(1, "At least one guest is required"),
  note: z.string().trim().max(500, "Note can be at most 500 characters").default(""),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updateBookingStatusSchema = z.object({
  status: z.enum(BOOKING_STATUSES.filter((status) => status !== "Pending") as ["Confirmed", "Completed", "Cancelled"]),
});

export const availabilityQuerySchema = z.object({
  studioId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid studio id"),
  date: calendarDate,
});
