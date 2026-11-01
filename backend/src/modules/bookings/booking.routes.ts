
import { Router } from "express";
import { bookTickets } from "./booking.controller";
import { requireAuth } from "../../middleware/auth.middleware";
import { cancelBookingHandler } from "./booking.controller";


const router = Router();

router.post("/", requireAuth, bookTickets);
router.patch("/:id/cancel", requireAuth, cancelBookingHandler);
export default router;
