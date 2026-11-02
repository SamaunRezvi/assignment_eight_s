import { Router } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as controller from "./bookings.controller.js";

export const bookingsRouter = Router();

bookingsRouter.get("/availability", controller.availability);

bookingsRouter.use(requireAuth);
bookingsRouter.post("/", controller.create);
bookingsRouter.get("/mine", controller.mine);
bookingsRouter.get("/hosted", controller.hosted);
bookingsRouter.patch("/:id/status", controller.updateStatus);
bookingsRouter.get("/:id/invoice", controller.invoice);
