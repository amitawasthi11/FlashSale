import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/admin.middleware";
import {
  bookTickets,
  cancelBookingHandler,
  myBookings,
  checkInHandler,
} from "./booking.controller";

const router = Router();

router.post("/", requireAuth, bookTickets);
router.get("/my-bookings", requireAuth, myBookings);
router.patch("/:id/cancel", requireAuth, cancelBookingHandler);
router.post("/check-in", requireAuth, requireAdmin, checkInHandler);

export default router;