import type { BookingStatus } from "../../types/models.js";
import { ApiError } from "../../utils/ApiError.js";

export const MIN_HOURS = 1;
export const MAX_HOURS = 12;

export function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Slots are stored as wall-clock times in the studio's own timezone, encoded as UTC. */
export function toSlotDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00.000Z`);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface SlotRequest {
  date: string;
  startTime: string;
  endTime: string;
}

export function resolveSlot({ date, startTime, endTime }: SlotRequest) {
  const durationMinutes = toMinutes(endTime) - toMinutes(startTime);
  if (durationMinutes <= 0) {
    throw ApiError.badRequest("The end time must be after the start time");
  }
  const hours = durationMinutes / 60;
  if (hours < MIN_HOURS || hours > MAX_HOURS) {
    throw ApiError.badRequest(`Bookings must be between ${MIN_HOURS} and ${MAX_HOURS} hours long`);
  }

  // Studios have no timezone of their own, so only whole calendar days in the past are rejected
  // (one day of tolerance keeps users in any timezone from being wrongly blocked).
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  const startAt = toSlotDate(date, startTime);
  if (startAt.getTime() < yesterday) {
    throw ApiError.badRequest("You cannot book a date in the past");
  }

  return { hours, startAt, endAt: toSlotDate(date, endTime) };
}

type Actor = "guest" | "host";

const TRANSITIONS: Record<Actor, Partial<Record<BookingStatus, BookingStatus[]>>> = {
  guest: { Pending: ["Cancelled"] },
  host: {
    Pending: ["Confirmed", "Cancelled"],
    Confirmed: ["Completed", "Cancelled"],
  },
};

export function assertTransition(actor: Actor, from: BookingStatus, to: BookingStatus) {
  if (!TRANSITIONS[actor][from]?.includes(to)) {
    throw ApiError.conflict(`A ${from.toLowerCase()} booking cannot be changed to ${to.toLowerCase()}`);
  }
}
