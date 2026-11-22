
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
          isCancelled: true,
        },
      });

      if (!event) throw new Error("EVENT_NOT_FOUND");
      if (event.isCancelled) throw new Error("EVENT_CANCELLED");

      const inventoryUpdate = await tx.event.updateMany({
        where: {
          id: eventId,
          isCancelled: false,
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

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

return tx.booking.create({
  data: {
    userId,
    eventId,
    quantity,
    totalAmountPaise,
    status: "PENDING",
    expiresAt,
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

export async function getMyBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    include: { event: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function cancelBooking(bookingId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.booking.updateMany({
      where: { id: bookingId, userId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });

    if (result.count !== 1) {
      throw new Error("BOOKING_NOT_FOUND");
    }

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { eventId: true, quantity: true },
    });

    await tx.event.update({
      where: { id: booking.eventId },
      data: { availableSeats: { increment: booking.quantity } },
    });

    return { message: "Booking cancelled successfully" };
  });
}

export async function expirePendingBookings() {
  return prisma.$transaction(async (tx) => {
    const now = new Date();

    const expiredBookings = await tx.booking.findMany({
      where: {
        status: "PENDING",
        expiresAt: {
          lte: now,
        },
      },
      select: {
        id: true,
        eventId: true,
        quantity: true,
      },
    });

    let expiredCount = 0;

    for (const booking of expiredBookings) {
      const result = await tx.booking.updateMany({
        where: {
          id: booking.id,
          status: "PENDING",
          expiresAt: {
            lte: now,
          },
        },
        data: {
          status: "CANCELLED",
        },
      });

      if (result.count === 1) {
        await tx.event.update({
          where: { id: booking.eventId },
          data: {
            availableSeats: {
              increment: booking.quantity,
            },
          },
        });

        expiredCount++;
      }
    }

    return expiredCount;
  });
}
export async function checkInTicket(ticketCode: string, eventId: string) {
  const checkedInAt = new Date();

  // 1. Atomically mark ticket as checked in ONLY if valid, confirmed, unused, and matches the event
  const result = await prisma.booking.updateMany({
    where: {
      ticketCode,
      eventId,
      status: "CONFIRMED",
      checkedInAt: null,
      event: { isCancelled: false },
    },
    data: { checkedInAt },
  });

  // 2. If updated, return attendee and ticket details for the scanner screen
  if (result.count === 1) {
    return prisma.booking.findUniqueOrThrow({
      where: { ticketCode },
      select: {
        id: true,
        ticketCode: true,
        quantity: true,
        checkedInAt: true,
        user: { select: { name: true, email: true } },
        event: { select: { id: true, title: true } },
      },
    });
  }

  // 3. Otherwise, inspect the ticket to give the gate scanner an exact reason
  const booking = await prisma.booking.findUnique({
    where: { ticketCode },
    select: {
      eventId: true,
      status: true,
      checkedInAt: true,
      event: { select: { title: true, isCancelled: true } },
    },
  });

  if (!booking) {
    throw new Error("INVALID_TICKET");
  }

  if (booking.eventId !== eventId) {
    throw new Error(`WRONG_EVENT:${booking.event.title}`);
  }

  if (booking.event.isCancelled) {
    throw new Error("EVENT_CANCELLED");
  }

  if (booking.status !== "CONFIRMED") {
    throw new Error("TICKET_NOT_CONFIRMED");
  }

  if (booking.checkedInAt) {
    throw new Error(`ALREADY_CHECKED_IN:${booking.checkedInAt.toISOString()}`);
  }

  throw new Error("CHECK_IN_FAILED");
}
