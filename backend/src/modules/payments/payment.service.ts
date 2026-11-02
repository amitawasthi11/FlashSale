
import { prisma } from "../../lib/prisma";
import { razorpay } from "../../lib/razorpay";

export async function createPaymentOrder(
  bookingId: string,
  userId: string
) {
  // Find booking and verify ownership
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      userId,
    },
  });

  if (!booking) {
    throw new Error("BOOKING_NOT_FOUND");
  }

  if (booking.status !== "PENDING") {
    throw new Error("BOOKING_NOT_PENDING");
  }

  if (!booking.expiresAt || booking.expiresAt <= new Date()) {
    throw new Error("BOOKING_EXPIRED");
  }

  if (booking.totalAmountPaise <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  // Create order with Razorpay
  const order = await razorpay.orders.create({
    amount: booking.totalAmountPaise,
    currency: "INR",
    receipt: booking.id,
    notes: {
      bookingId: booking.id,
      userId,
    },
  });

  // Save payment order in PostgreSQL
  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      razorpayOrderId: order.id,
      amountPaise: booking.totalAmountPaise,
      currency: "INR",
      status: "CREATED",
    },
  });

  return {
    payment,
    razorpayOrder: order,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
}
