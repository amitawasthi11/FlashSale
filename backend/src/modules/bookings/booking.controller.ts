
import type { Request, Response, NextFunction } from "express";
import { createBooking } from "./booking.service";
import { cancelBooking } from "./booking.service";
import { getMyBookings } from "./booking.service";

type AuthenticatedRequest = Request & {
  user?: { id: string };
};

export async function bookTickets(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const userId = authenticatedReq.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    const { eventId, quantity } = req.body ?? {};

    if (
      typeof eventId !== "string" ||
      eventId.trim().length === 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      res.status(400).json({
        success: false,
        message: "Provide a valid eventId and quantity from 1 to 10.",
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
      message: "Tickets reserved successfully.",
      data: { booking },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "EVENT_NOT_FOUND") {
        res.status(404).json({
          success: false,
          message: "Event not found.",
        });
        return;
      }

      if (error.message === "INSUFFICIENT_SEATS") {
        res.status(409).json({
          success: false,
          message: "Not enough seats available.",
        });
        return;
      }

      if (error.message === "INVALID_TOTAL_AMOUNT") {
        res.status(400).json({
          success: false,
          message: "Booking total is outside the supported range.",
        });
        return;
      }
    }

    next(error);
  }
}
export async function cancelBookingHandler(req: any, res: any) {
  try {
    const result = await cancelBooking(req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "BOOKING_NOT_FOUND") {
      res.status(404).json({ message: "Pending booking not found" });
      return;
    }

    res.status(500).json({ message: "Failed to cancel booking" });
  }
}

export async function myBookings(req: any, res: any) {
  try {
    const bookings = await getMyBookings(req.user.id);
    res.json({ success: true, bookings });
  } catch {
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
}