import { Router } from "express";
import { bookingsRouter } from "./modules/bookings/bookings.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { newsletterRouter } from "./modules/newsletter/newsletter.routes.js";
import { reviewsRouter } from "./modules/reviews/reviews.routes.js";
import { studiosRouter } from "./modules/studios/studios.routes.js";
import { uploadsRouter } from "./modules/uploads/uploads.routes.js";
import { wishlistRouter } from "./modules/wishlist/wishlist.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok", uptime: Math.round(process.uptime()) } });
});

apiRouter.use("/studios", studiosRouter);
apiRouter.use("/bookings", bookingsRouter);
apiRouter.use("/wishlist", wishlistRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/newsletter", newsletterRouter);
apiRouter.use(reviewsRouter);
