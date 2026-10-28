
import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().max(2000).optional(),
  venue: z.string().trim().min(2).max(200),
  startsAt: z.iso.datetime(),
  totalSeats: z.number().int().positive().max(100000),
  priceInPaise: z.number().int().nonnegative(),
});
