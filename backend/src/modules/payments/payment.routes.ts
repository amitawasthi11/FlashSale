
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { createPaymentOrderHandler } from "./payment.controller";

const router = Router();

router.post("/create-order", requireAuth, createPaymentOrderHandler);

export default router;
