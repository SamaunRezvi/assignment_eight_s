import { Router, type Request, type Response } from "express";
import { collections } from "../../config/db.js";
import { currentUser, requireAuth } from "../../middleware/authenticate.js";
import { ok } from "../../utils/http.js";
import { BOOKING_STATUSES, type BookingStatus } from "../../types/models.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

function emptyStatusCounts(): Record<BookingStatus, number> {
  return Object.fromEntries(BOOKING_STATUSES.map((status) => [status, 0])) as Record<BookingStatus, number>;
}

dashboardRouter.get("/summary", async (req: Request, res: Response) => {
  const { id } = currentUser(req);
  const earningStatuses = ["Confirmed", "Completed"];

  const [listings, hostStatus, guestStatus, monthly, wishlistCount, spent] = await Promise.all([
    collections.studios().countDocuments({ ownerId: id }),
    collections.bookings()
      .aggregate<{ _id: BookingStatus; count: number }>([
        { $match: { hostId: id } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
    collections.bookings()
      .aggregate<{ _id: BookingStatus; count: number }>([
        { $match: { userId: id } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
    collections.bookings()
      .aggregate<{ _id: string; revenue: number; bookings: number }>([
        { $match: { hostId: id, status: { $in: earningStatuses } } },
        { $group: { _id: { $substrBytes: ["$date", 0, 7] }, revenue: { $sum: "$subtotal" }, bookings: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 6 },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
    collections.wishlists().countDocuments({ userId: id }),
    collections.bookings()
      .aggregate<{ total: number }>([
        { $match: { userId: id, status: { $in: earningStatuses } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ])
      .toArray(),
  ]);

  const hostCounts = emptyStatusCounts();
  hostStatus.forEach((item) => (hostCounts[item._id] = item.count));
  const guestCounts = emptyStatusCounts();
  guestStatus.forEach((item) => (guestCounts[item._id] = item.count));

  ok(res, {
    host: {
      listings,
      bookingsByStatus: hostCounts,
      revenue: monthly.reduce((sum, month) => sum + month.revenue, 0),
      monthly: monthly.map((month) => ({ month: month._id, revenue: month.revenue, bookings: month.bookings })),
    },
    guest: {
      bookingsByStatus: guestCounts,
      totalSpent: spent[0]?.total ?? 0,
      wishlist: wishlistCount,
    },
  });
});
