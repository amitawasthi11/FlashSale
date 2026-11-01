
import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000).optional(),
  venue: z.string().trim().min(2).max(200),
  startsAt: z.iso.datetime().refine(
    (date) => new Date(date).getTime() > Date.now(),
    "Event date must be in the future"
  ),
  totalSeats: z.number().int().min(1).max(100000),
  priceInPaise: z.number().int().min(0).max(100000000),
});
