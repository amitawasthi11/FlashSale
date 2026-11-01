
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
        where: { id: req.params.id },
        select: {
          totalSeats: true,
          availableSeats: true,
          isCancelled: true,
        },
      });

      if (!current) throw new Error("EVENT_NOT_FOUND");
      if (current.isCancelled) throw new Error("EVENT_CANCELLED");

      const bookedSeats = current.totalSeats - current.availableSeats;

      if (totalSeats < bookedSeats) {
        throw new Error("TOTAL_SEATS_BELOW_BOOKED");
      }

      return tx.event.update({
        where: { id: req.params.id },
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
    const eventId = req.params.id;

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
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: { id: true, isCancelled: true },
    });

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found",
      });
      return;
    }

    if (event.isCancelled) {
      res.status(409).json({
        success: false,
        message: "Event is already cancelled",
      });
      return;
    }

    const updatedEvent = await prisma.event.update({
      where: { id: event.id },
      data: { isCancelled: true },
    });

    res.status(200).json({
      success: true,
      message: "Event cancelled successfully",
      data: updatedEvent,
    });
  } catch (error) {
    next(error);
  }
});

// Get one event — Public
router.get("/:id", async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
    });

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found",
      });
      return;
    }

    res.status(200).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// Get all events — Public
router.get("/", async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { startsAt: "asc" },
    });

    res.status(200).json({
      success: true,
      count: events.length,
      data: events,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
