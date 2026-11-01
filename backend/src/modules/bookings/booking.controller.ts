
import type { Request, Response, NextFunction } from "express";
import {
  createBooking,
  cancelBooking,
  getMyBookings,
} from "./booking.service";

type AuthenticatedRequest = Request & {
  user?: { id: string };
};

export async function bookTickets(
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

    const { eventId, quantity } = req.body ?? {};

    if (
      typeof eventId !== "string" ||
      !eventId.trim() ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      res.status(400).json({
        success: false,
        message: "Provide a valid eventId and quantity from 1 to 10",
      });
      return;
    }

    const booking = await createBooking({
      userId,
      eventId,
      quantity,
    });

    res.status(201).json({
      success: true,
      message: "Tickets reserved successfully",
      data: { booking },
    });
  } catch (error) {
    if (error instanceof Error) {
      const errors: Record<string, { status: number; message: string }> = {
        EVENT_NOT_FOUND: {
          status: 404,
          message: "Event not found",
        },
        EVENT_CANCELLED: {
          status: 409,
          message: "This event has been cancelled",
        },
        INSUFFICIENT_SEATS: {
          status: 409,
          message: "Not enough seats available",
        },
        INVALID_TOTAL_AMOUNT: {
          status: 400,
          message: "Invalid booking amount",
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

      if (error.message.startsWith("Quantity must")) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }
    }

    next(error);
  }
}

export async function cancelBookingHandler(
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

    const result = await cancelBooking(req.params.id, userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOKING_NOT_FOUND") {
      res.status(404).json({
        success: false,
        message: "Pending booking not found",
      });
      return;
    }

    next(error);
  }
}

export async function myBookings(
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

    const bookings = await getMyBookings(userId);
    res.status(200).json({ success: true, bookings });
  } catch (error) {
    next(error);
  }
}
