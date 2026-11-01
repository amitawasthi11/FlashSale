
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
// update event 
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

    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: {
        ...eventData,
        totalSeats,
        availableSeats: totalSeats,
      },
    });

    res.status(200).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});
// delete event

router.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const eventId = req.params.id;

    const bookings = await prisma.booking.count({
      where: { eventId },
    });

    if (bookings > 0) {
      res.status(409).json({
        success: false,
        message: "Cannot delete this event because bookings exist. Cancel or manage the bookings first.",
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
