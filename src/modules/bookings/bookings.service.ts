import type { ClientSession, Filter } from "mongodb";
import { collections, getClient } from "../../config/db.js";
import type { AuthUser, BookingDoc, BookingStatus } from "../../types/models.js";
import { ApiError } from "../../utils/ApiError.js";
import { toObjectId } from "../../utils/objectId.js";
import type { CreateBookingInput } from "./bookings.schema.js";
import { assertTransition, resolveSlot, roundMoney } from "./bookings.rules.js";

const COLLISION_MESSAGE =
  "This time slot is already booked. Please choose a different time or date.";

/** Finds a Confirmed booking on the studio whose time range overlaps [startAt, endAt). */
function findConfirmedOverlap(
  studioId: BookingDoc["studioId"],
  startAt: Date,
  endAt: Date,
  session: ClientSession,
  excludeId?: BookingDoc["_id"],
) {
  const filter: Filter<BookingDoc> = {
    studioId,
    status: "Confirmed",
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
    ...(excludeId && { _id: { $ne: excludeId } }),
  };
  return collections.bookings().findOne(filter, { session });
}

/**
 * Concurrent writers for the same studio all touch the studio document, so MongoDB
 * serialises their transactions (one is retried) and the overlap check can never race.
 */
function lockStudio(studioId: BookingDoc["studioId"], session: ClientSession) {
  return collections.studios().findOneAndUpdate(
    { _id: studioId },
    { $inc: { bookingVersion: 1 } },
    { session, returnDocument: "after" },
  );
}

async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = getClient().startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

export async function createBooking(user: AuthUser, input: CreateBookingInput): Promise<BookingDoc> {
  const { hours, startAt, endAt } = resolveSlot(input);
  const studioId = toObjectId(input.studioId, "studio id");

  return inTransaction(async (session) => {
    const studio = await lockStudio(studioId, session);
    if (!studio) throw ApiError.notFound("This studio is no longer available");
    if (studio.ownerId === user.id) throw ApiError.forbidden("You cannot book your own studio");
    if (input.guests > studio.maxCapacity) {
      throw ApiError.badRequest(`This studio fits at most ${studio.maxCapacity} guests`);
    }

    if (await findConfirmedOverlap(studioId, startAt, endAt, session)) {
      throw ApiError.conflict(COLLISION_MESSAGE);
    }

    const ownOverlap = await collections.bookings().findOne(
      {
        studioId,
        userId: user.id,
        status: { $in: ["Pending", "Confirmed"] },
        startAt: { $lt: endAt },
        endAt: { $gt: startAt },
      },
      { session },
    );
    if (ownOverlap) {
      throw ApiError.conflict("You already have an active request that overlaps this time slot");
    }

    const subtotal = roundMoney(hours * studio.hourlyRate);
    const now = new Date();
    const doc: Omit<BookingDoc, "_id"> = {
      studioId,
      studioTitle: studio.title,
      studioImage: studio.image,
      studioLocation: `${studio.location.address}, ${studio.location.city}`,
      hostId: studio.ownerId,
      hostEmail: studio.ownerEmail,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      startAt,
      endAt,
      hours,
      guests: input.guests,
      hourlyRate: studio.hourlyRate,
      subtotal,
      securityDeposit: studio.securityDeposit,
      total: roundMoney(subtotal + studio.securityDeposit),
      note: input.note,
      status: "Pending",
      createdAt: now,
      updatedAt: now,
    };
    const { insertedId } = await collections.bookings().insertOne(doc as BookingDoc, { session });
    return { ...doc, _id: insertedId };
  });
}

export function listGuestBookings(userId: string) {
  return collections.bookings().find({ userId }).sort({ createdAt: -1 }).toArray();
}

export function listHostBookings(hostId: string) {
  return collections.bookings().find({ hostId }).sort({ createdAt: -1 }).toArray();
}

export async function getBookingForParticipant(user: AuthUser, id: string): Promise<BookingDoc> {
  const booking = await collections.bookings().findOne({ _id: toObjectId(id, "booking id") });
  // Same response for "missing" and "not yours" so booking ids cannot be probed.
  if (!booking || (booking.userId !== user.id && booking.hostId !== user.id)) {
    throw ApiError.notFound("This booking could not be found");
  }
  return booking;
}

export async function updateBookingStatus(
  user: AuthUser,
  id: string,
  nextStatus: Exclude<BookingStatus, "Pending">,
): Promise<BookingDoc> {
  const booking = await getBookingForParticipant(user, id);
  const actor = booking.hostId === user.id ? "host" : "guest";
  assertTransition(actor, booking.status, nextStatus);

  return inTransaction(async (session) => {
    if (nextStatus === "Confirmed") {
      await lockStudio(booking.studioId, session);
      const clash = await findConfirmedOverlap(
        booking.studioId,
        booking.startAt,
        booking.endAt,
        session,
        booking._id,
      );
      if (clash) throw ApiError.conflict(COLLISION_MESSAGE);
    }

    // The status guard makes the transition atomic if two requests arrive together.
    const updated = await collections.bookings().findOneAndUpdate(
      { _id: booking._id, status: booking.status },
      { $set: { status: nextStatus, updatedAt: new Date() } },
      { session, returnDocument: "after" },
    );
    if (!updated) throw ApiError.conflict("This booking was just updated. Refresh and try again.");
    return updated;
  });
}

export async function listConfirmedSlots(studioId: string, date: string) {
  const slots = await collections.bookings()
    .find({ studioId: toObjectId(studioId, "studio id"), date, status: "Confirmed" })
    .project<Pick<BookingDoc, "startTime" | "endTime">>({ startTime: 1, endTime: 1, _id: 0 })
    .sort({ startTime: 1 })
    .toArray();
  return slots;
}
