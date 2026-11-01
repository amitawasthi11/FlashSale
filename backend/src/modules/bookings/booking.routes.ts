
import { Router } from "express";
import { bookTickets } from "./booking.controller";
import { requireAuth } from "../../middleware/auth.middleware";
import { cancelBookingHandler,myBookings } from "./booking.controller";


const router = Router();

router.post("/", requireAuth, bookTickets);
router.get("/my-bookings", requireAuth, myBookings);
router.patch("/:id/cancel", requireAuth, cancelBookingHandler);
export default router;
