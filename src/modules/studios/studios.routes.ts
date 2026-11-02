import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/authenticate.js";
import * as controller from "./studios.controller.js";

export const studiosRouter = Router();

studiosRouter.get("/", controller.list);
studiosRouter.get("/featured", controller.featured);
studiosRouter.get("/cities", controller.cities);
studiosRouter.get("/mine", requireAuth, controller.mine);
studiosRouter.get("/:id", optionalAuth, controller.detail);

studiosRouter.post("/", requireAuth, controller.create);
studiosRouter.put("/:id", requireAuth, controller.update);
studiosRouter.delete("/:id", requireAuth, controller.remove);
