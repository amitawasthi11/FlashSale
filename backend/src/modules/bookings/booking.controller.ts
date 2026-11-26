
import type { Request, Response, NextFunction } from "express";
import { checkInTicket } from "./booking.service";
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
const bookingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
if (!bookingId) {
  return res.status(400).json({ error: "Booking ID is required" });
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
export async function checkInHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { ticketCode, eventId } = req.body ?? {};

    if (
      typeof ticketCode !== "string" ||
      !ticketCode.trim() ||
      typeof eventId !== "string" ||
      !eventId.trim()
    ) {
      res.status(400).json({
        success: false,
        code: "INVALID_INPUT",
        message: "Both ticketCode and eventId are required",
      });
      return;
    }

    const booking = await checkInTicket(ticketCode.trim(), eventId.trim());

    res.status(200).json({
      success: true,
      message: "Ticket valid — attendee checked in",
      data: { booking },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_TICKET") {
        res.status(404).json({
          success: false,
          code: "INVALID_TICKET",
          message: "Invalid or unrecognized ticket code",
        });
        return;
      }

      if (error.message.startsWith("WRONG_EVENT:")) {
        const actualEvent = error.message.split(":")[1];
        res.status(400).json({
          success: false,
          code: "WRONG_EVENT",
          message: `This ticket belongs to "${actualEvent}", not the selected event`,
        });
        return;
      }

      if (error.message === "EVENT_CANCELLED") {
        res.status(409).json({
          success: false,
          code: "EVENT_CANCELLED",
          message: "This event has been cancelled",
        });
        return;
      }

      if (error.message === "TICKET_NOT_CONFIRMED") {
        res.status(400).json({
          success: false,
          code: "TICKET_NOT_CONFIRMED",
          message: "Ticket is unpaid or has been cancelled",
        });
        return;
      }

      if (error.message.startsWith("ALREADY_CHECKED_IN:")) {
        const scannedAt = error.message.slice("ALREADY_CHECKED_IN:".length);
        res.status(409).json({
          success: false,
          code: "ALREADY_USED",
          message: `Ticket was already checked in at ${scannedAt}`,
        });
        return;
      }
    }

    next(error);
  }
}