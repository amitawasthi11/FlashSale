
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

type CreateBookingInput = {
  userId: string;
  eventId: string;
  quantity: number;
};

export async function createBooking(input: CreateBookingInput) {
  const { userId, eventId, quantity } = input;

  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error("Quantity must be an integer between 1 and 10.");
  }

  return prisma.$transaction(
    async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          priceInPaise: true,
          availableSeats: true,
        },
      });

      if (!event) {
        throw new Error("EVENT_NOT_FOUND");
      }

      // Check the current inventory and decrement atomically.
      const inventoryUpdate = await tx.event.updateMany({
        where: {
          id: eventId,
          availableSeats: { gte: quantity },
        },
        data: {
          availableSeats: { decrement: quantity },
        },
      });

      if (inventoryUpdate.count !== 1) {
        throw new Error("INSUFFICIENT_SEATS");
      }

      const totalAmountPaise = event.priceInPaise * quantity;

      if (!Number.isSafeInteger(totalAmountPaise)) {
        throw new Error("INVALID_TOTAL_AMOUNT");
      }

      // If booking creation fails, the seat update rolls back too.
      return tx.booking.create({
        data: {
          userId,
          eventId,
          quantity,
          totalAmountPaise,
          status: "PENDING",
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5000,
      timeout: 10000,
    }
  );
}
