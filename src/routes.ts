import { Router } from "express";
import { bookingsRouter } from "./modules/bookings/bookings.routes.js";
import { studiosRouter } from "./modules/studios/studios.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok", uptime: Math.round(process.uptime()) } });
});

apiRouter.use("/studios", studiosRouter);
apiRouter.use("/bookings", bookingsRouter);
