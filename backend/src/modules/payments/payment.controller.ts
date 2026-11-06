
import type { Request, Response, NextFunction } from "express";
import {
  createPaymentOrder,
  verifyPayment,
} from "./payment.service";

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

export async function verifyPaymentHandler(
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

    const {
      bookingId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body ?? {};

    if (
      typeof bookingId !== "string" ||
      typeof razorpayOrderId !== "string" ||
      typeof razorpayPaymentId !== "string" ||
      typeof razorpaySignature !== "string" ||
      !bookingId.trim() ||
      !razorpayOrderId.trim() ||
      !razorpayPaymentId.trim() ||
      !/^[a-f0-9]{64}$/i.test(razorpaySignature)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid payment verification details",
      });
      return;
    }

    const result = await verifyPayment({
      bookingId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      userId,
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      const errors: Record<
        string,
        { status: number; message: string }
      > = {
        PAYMENT_NOT_FOUND: {
          status: 404,
          message: "Payment not found",
        },
        PAYMENT_NOT_PENDING: {
          status: 409,
          message: "Payment is not pending",
        },
        INVALID_PAYMENT_SIGNATURE: {
          status: 400,
          message: "Invalid payment signature",
        },
        PAYMENT_NOT_CAPTURED: {
          status: 409,
          message: "Payment is not captured",
        },
        BOOKING_EXPIRED_OR_NOT_PENDING: {
          status: 409,
          message:
            "Booking expired or is no longer pending. Contact support if payment was captured.",
        },
        PAYMENT_ALREADY_PROCESSED: {
          status: 409,
          message: "Payment has already been processed",
        },
        PAYMENT_CONFIGURATION_ERROR: {
          status: 500,
          message: "Payment configuration error",
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

