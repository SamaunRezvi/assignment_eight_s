import type { BookingDoc } from "../../types/models.js";

export function toBookingDto(doc: BookingDoc) {
  return {
    id: doc._id.toString(),
    studioId: doc.studioId.toString(),
    studioTitle: doc.studioTitle,
    studioImage: doc.studioImage,
    studioLocation: doc.studioLocation,
    guestName: doc.userName,
    guestEmail: doc.userEmail,
    hostEmail: doc.hostEmail,
    date: doc.date,
    startTime: doc.startTime,
    endTime: doc.endTime,
    hours: doc.hours,
    guests: doc.guests,
    hourlyRate: doc.hourlyRate,
    subtotal: doc.subtotal,
    securityDeposit: doc.securityDeposit,
    total: doc.total,
    note: doc.note,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
