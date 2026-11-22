import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { razorpayWebhook } from "./modules/payments/payment.webhook";
import { errorHandler } from "./middleware/errorHandler.js";
import eventRoutes from "./routes/eventRoutes.js";
import bookingRoutes from "./modules/bookings/booking.routes";
import authRoutes from "./modules/auth/auth.routes";
import paymentRoutes from "./modules/payments/payment.routes";

const app = express();

// 1. Webhook MUST stay before express.json() and rate limiters
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  razorpayWebhook
);

// 2. Security headers & CORS
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "100kb" }));

// 3. Rate limiters (brute-force & flash-sale bot protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, message: "Too many auth attempts, try again later" },
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { success: false, message: "Too many booking requests, slow down" },
});

// 4. Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/bookings", bookingLimiter, bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/events", eventRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "FlashSale API is running!",
    timestamp: new Date().toISOString(),
  });
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use(errorHandler);

export default app;