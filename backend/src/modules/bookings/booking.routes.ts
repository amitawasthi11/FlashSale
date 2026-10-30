
import { Router } from "express";
import { bookTickets } from "./booking.controller";
import { requireAuth } from "../../middleware/auth.middleware";



const router = Router();

router.post("/", requireAuth, bookTickets);

export default router;
