import type { Request, Response } from "express";
import { currentUser } from "../../middleware/authenticate.js";
import { ApiError } from "../../utils/ApiError.js";
import { ok } from "../../utils/http.js";
import { parse } from "../../utils/validate.js";
import { toBookingDto } from "./bookings.dto.js";
import {
  availabilityQuerySchema,
  createBookingSchema,
  updateBookingStatusSchema,
} from "./bookings.schema.js";
import * as bookings from "./bookings.service.js";
import { streamInvoice } from "./invoice.service.js";

export async function create(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parse(createBookingSchema, req.body);
  const booking = await bookings.createBooking(user, input);
  ok(res, toBookingDto(booking), 201);
}

export async function mine(req: Request, res: Response) {
  const items = await bookings.listGuestBookings(currentUser(req).id);
  ok(res, items.map(toBookingDto));
}

export async function hosted(req: Request, res: Response) {
  const items = await bookings.listHostBookings(currentUser(req).id);
  ok(res, items.map(toBookingDto));
}

export async function updateStatus(req: Request, res: Response) {
  const user = currentUser(req);
  const { status } = parse(updateBookingStatusSchema, req.body);
  const booking = await bookings.updateBookingStatus(user, String(req.params.id), status);
  ok(res, toBookingDto(booking));
}

export async function availability(req: Request, res: Response) {
  const { studioId, date } = parse(availabilityQuerySchema, req.query);
  ok(res, await bookings.listConfirmedSlots(studioId, date));
}

export async function invoice(req: Request, res: Response) {
  const booking = await bookings.getBookingForParticipant(currentUser(req), String(req.params.id));
  if (booking.status !== "Confirmed" && booking.status !== "Completed") {
    throw ApiError.conflict("An invoice is available once the booking is confirmed");
  }
  streamInvoice(booking, res);
}
