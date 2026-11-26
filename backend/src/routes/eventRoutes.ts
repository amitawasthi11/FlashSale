import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createEventSchema } from "../schemas/eventSchema.js";
import { requireAuth } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/admin.middleware";

const router = Router();

// Create event — Admin only
router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = createEventSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Invalid event data",
        errors: result.error.issues,
      });
      return;
    }

    const { totalSeats, ...eventData } = result.data;

    const event = await prisma.event.create({
      data: {
        ...eventData,
        totalSeats,
        availableSeats: totalSeats,
      },
    });

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// Update event — Admin only
router.put("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const result = createEventSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Invalid event data",
        errors: result.error.issues,
      });
      return;
    }

    const { totalSeats, ...eventData } = result.data;

    const event = await prisma.$transaction(async (tx) => {
      const current = await tx.event.findUnique({
        where: { id },
        select: {
          totalSeats: true,
          availableSeats: true,
          priceInPaise: true,
          isCancelled: true,
        },
      });

      if (!current) throw new Error("EVENT_NOT_FOUND");
      if (current.isCancelled) throw new Error("EVENT_CANCELLED");

      const bookedSeats = current.totalSeats - current.availableSeats;

      if (bookedSeats > 0 && eventData.priceInPaise !== current.priceInPaise) {
        throw new Error("PRICE_LOCKED_WITH_BOOKINGS");
      }

      if (totalSeats < bookedSeats) {
        throw new Error("TOTAL_SEATS_BELOW_BOOKED");
      }

      return tx.event.update({
        where: { id },
        data: {
          ...eventData,
          totalSeats,
          availableSeats: totalSeats - bookedSeats,
        },
      });
    });

    res.status(200).json({ success: true, data: event });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "EVENT_NOT_FOUND") {
        res.status(404).json({
          success: false,
          message: "Event not found",
        });
        return;
      }

      if (error.message === "EVENT_CANCELLED") {
        res.status(409).json({
          success: false,
          message: "Cannot update a cancelled event",
        });
        return;
      }

      if (error.message === "TOTAL_SEATS_BELOW_BOOKED") {
        res.status(400).json({
          success: false,
          message: "Total seats cannot be less than already booked seats",
        });
        return;
      }
    }

    next(error);
  }
});

// Delete event — Admin only
router.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const eventId = String(req.params.id);

    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!existingEvent) {
      res.status(404).json({
        success: false,
        message: "Event not found",
      });
      return;
    }

    const bookings = await prisma.booking.count({
      where: { eventId },
    });

    if (bookings > 0) {
      res.status(409).json({
        success: false,
        message: "Cannot delete an event that has bookings",
      });
      return;
    }

    const event = await prisma.event.delete({
      where: { id: eventId },
    });

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

// Cancel event — Admin only
router.patch("/:id/cancel", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = String(req.params.id);

    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id },
        select: { id: true, isCancelled: true },
      });

      if (!event) throw new Error("EVENT_NOT_FOUND");
      if (event.isCancelled) throw new Error("EVENT_ALREADY_CANCELLED");

      // Find all pending bookings to restore their reserved seats
      const pendingBookings = await tx.booking.findMany({
        where: { eventId: event.id, status: "PENDING" },
        select: { id: true, quantity: true },
      });

      const seatsToRestore = pendingBookings.reduce(
        (sum, b) => sum + b.quantity,
        0
      );

      // Cancel all pending bookings
      const cancelledPending = await tx.booking.updateMany({
        where: { eventId: event.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });

      // Count confirmed bookings that will require manual/automated refunds
      const confirmedBookingsToRefund = await tx.booking.count({
        where: { eventId: event.id, status: "CONFIRMED" },
      });

      // Mark event cancelled and restore seats from pending bookings
      const updatedEvent = await tx.event.update({
        where: { id: event.id },
        data: {
          isCancelled: true,
          ...(seatsToRestore > 0 && {
            availableSeats: { increment: seatsToRestore },
          }),
        },
      });

      return {
        updatedEvent,
        cancelledPendingCount: cancelledPending.count,
        confirmedBookingsToRefund,
      };
    });

    res.status(200).json({
      success: true,
      message: "Event cancelled successfully",
      data: result.updatedEvent,
      meta: {
        cancelledPendingBookings: result.cancelledPendingCount,
        confirmedBookingsToRefund: result.confirmedBookingsToRefund,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "EVENT_NOT_FOUND") {
        res.status(404).json({ success: false, message: "Event not found" });
        return;
      }
      if (error.message === "EVENT_ALREADY_CANCELLED") {
        res.status(409).json({ success: false, message: "Event is already cancelled" });
        return;
      }
    }
    next(error);
  }
});

// Get all active events — Public (supports search, filters, sorting, pagination)
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const venue = typeof req.query.venue === "string" ? req.query.venue.trim() : "";
    const fromDate = typeof req.query.fromDate === "string" ? new Date(req.query.fromDate) : null;
    const toDate = typeof req.query.toDate === "string" ? new Date(req.query.toDate) : null;
    const includePast = req.query.includePast === "true";

    // Build dynamic filter
    const where: any = {
      isCancelled: false,
    };

    if (!includePast) {
      where.startsAt = { gte: new Date() };
    }

    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      where.startsAt = { ...where.startsAt, gte: fromDate };
    }

    if (toDate && !Number.isNaN(toDate.getTime())) {
      where.startsAt = { ...where.startsAt, lte: toDate };
    }

    if (venue) {
      where.venue = { contains: venue, mode: "insensitive" };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { venue: { contains: search, mode: "insensitive" } },
      ];
    }

    // Allowed sort fields
    const sortBy = req.query.sortBy === "priceInPaise" ? "priceInPaise" : "startsAt";
    const order = req.query.order === "desc" ? "desc" : "asc";

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
      }),
      prisma.event.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;