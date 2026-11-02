
import { prisma } from "../../lib/prisma";

export async function expirePendingBookings() {
  return prisma.$transaction(async (tx) => {
    const expiredBookings = await tx.booking.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lte: new Date() },
      },
      select: {
        id: true,
        eventId: true,
        quantity: true,
      },
    });

    let expiredCount = 0;

    for (const booking of expiredBookings) {
      // Claim only bookings that are still pending.
      const result = await tx.booking.updateMany({
        where: {
          id: booking.id,
          status: "PENDING",
          expiresAt: { lte: new Date() },
        },
        data: { status: "CANCELLED" },
      });

      // Restore seats only if this operation claimed the booking.
      if (result.count === 1) {
        await tx.event.update({
          where: { id: booking.eventId },
          data: {
            availableSeats: { increment: booking.quantity },
          },
        });

        expiredCount++;
      }
    }

    return { expiredCount };
  });
}
