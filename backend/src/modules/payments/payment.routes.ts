
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import {
  createPaymentOrderHandler,
  verifyPaymentHandler,
} from "./payment.controller";

const router = Router();

router.post("/create-order", requireAuth, createPaymentOrderHandler);
router.post("/verify", requireAuth, verifyPaymentHandler);

export default router;
