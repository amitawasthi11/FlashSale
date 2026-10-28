
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createEventSchema } from "../schemas/eventSchema.js";

const router = Router();

router.post("/", async (req, res, next) => {
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

    const event = await prisma.event.create({
      data: result.data,
    });

    res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: {
        startsAt: "asc",
      },
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
