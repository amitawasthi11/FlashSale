
import type { Request, Response, NextFunction } from "express";
import { createPaymentOrder } from "./payment.service";

type AuthenticatedRequest = Request & {
  user?: { id: string };
};

export async function createPaymentOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const { bookingId } = req.body ?? {};

    if (typeof bookingId !== "string" || !bookingId.trim()) {
      res.status(400).json({
        success: false,
        message: "Valid bookingId is required",
      });
      return;
    }

    const result = await createPaymentOrder(bookingId, userId);

    res.status(201).json({
      success: true,
      message: "Payment order created successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      const errors: Record<string, { status: number; message: string }> = {
        BOOKING_NOT_FOUND: {
          status: 404,
          message: "Booking not found",
        },
        BOOKING_NOT_PENDING: {
          status: 409,
          message: "Booking is not pending",
        },
        BOOKING_EXPIRED: {
          status: 409,
          message: "Booking has expired",
        },
        INVALID_AMOUNT: {
          status: 400,
          message: "Invalid payment amount",
        },
      };

      const knownError = errors[error.message];

      if (knownError) {
        res.status(knownError.status).json({
          success: false,
          message: knownError.message,
        });
        return;
      }
    }

    next(error);
  }
}
