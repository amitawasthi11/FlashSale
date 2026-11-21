import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client";

const ERROR_MAP: Record<string, { status: number; message: string }> = {
  // Auth & Ownership
  UNAUTHORIZED: { status: 401, message: "Authentication required" },
  INVALID_CREDENTIALS: { status: 401, message: "Invalid email or password" },
  FORBIDDEN: { status: 403, message: "You do not have permission to perform this action" },

  // Events
  EVENT_NOT_FOUND: { status: 404, message: "Event not found" },
  EVENT_CANCELLED: { status: 400, message: "This event has been cancelled" },
  EVENT_ALREADY_STARTED: { status: 400, message: "Booking is closed because the event has already started" },
  INSUFFICIENT_SEATS: { status: 409, message: "Not enough seats available for this event" },

  // Bookings
  BOOKING_NOT_FOUND: { status: 404, message: "Booking not found" },
  BOOKING_NOT_PENDING: { status: 400, message: "Booking is no longer in pending state" },
  BOOKING_EXPIRED: { status: 400, message: "Booking reservation has expired" },
  BOOKING_EXPIRED_OR_NOT_PENDING: { status: 400, message: "Booking has expired or is no longer pending" },
  INVALID_TOTAL_AMOUNT: { status: 400, message: "Invalid booking amount" },

  // Payments & Reconciliation
  PAYMENT_NOT_FOUND: { status: 404, message: "Payment record not found" },
  PAYMENT_NOT_PENDING: { status: 400, message: "Payment is already processed or cancelled" },
  INVALID_AMOUNT: { status: 400, message: "Invalid payment amount" },
  INVALID_PAYMENT_SIGNATURE: { status: 400, message: "Payment signature verification failed" },
  PAYMENT_NOT_CAPTURED: { status: 400, message: "Payment was not captured by Razorpay" },
  PAYMENT_ALREADY_PROCESSED: { status: 409, message: "Payment has already been processed" },
  BOOKING_EXPIRED_PAYMENT_CAPTURED_RECONCILIATION_NEEDED: {
    status: 409,
    message: "Payment was captured after your booking expired. Our team has logged this for refund review.",
  },
  PAYMENT_CONFIGURATION_ERROR: { status: 500, message: "Payment gateway configuration error" },
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // 1. Zod input validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: err.issues[0]?.message ?? "Invalid request input",
      errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  // 2. Known application domain errors (thrown as new Error("CODE"))
  if (err instanceof Error) {
    const mapped = ERROR_MAP[err.message];
    if (mapped) {
      res.status(mapped.status).json({
        success: false,
        code: err.message,
        message: mapped.message,
      });
      return;
    }

    // Handle descriptive validation messages like "Quantity must be an integer between 1 and 10."
    if (err.message.startsWith("Quantity must be")) {
      res.status(400).json({
        success: false,
        code: "INVALID_QUANTITY",
        message: err.message,
      });
      return;
    }
  }

  // 3. Prisma known request errors (e.g. unique constraint P2002, record not found P2025)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({
        success: false,
        code: "CONFLICT",
        message: "A record with this unique value already exists",
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Requested record was not found",
      });
      return;
    }
  }

  // 4. Unexpected server errors
  console.error("Unhandled server error:", err);
  res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
  });
};