
import { prisma } from "../../lib/prisma";
import { razorpay } from "../../lib/razorpay";
import crypto from "node:crypto";

export async function createPaymentOrder(
  bookingId: string,
  userId: string
) {
  // 1. Find booking and verify ownership
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

  // 2. Create Razorpay order
  const order = await razorpay.orders.create({
    amount: booking.totalAmountPaise,
    currency: "INR",
    receipt: booking.id,
    notes: {
      bookingId: booking.id,
      userId,
    },
  });

  // 3. Save payment record
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

type VerifyPaymentInput = {
  bookingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  userId: string;
};

export async function verifyPayment(input: VerifyPaymentInput) {
  const {
    bookingId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    userId,
  } = input;

  // 1. Find payment and verify ownership
  const paymentRecord = await prisma.payment.findFirst({
    where: {
      bookingId,
      razorpayOrderId,
      booking: { userId },
    },
    include: { booking: true },
  });

  if (!paymentRecord) {
    throw new Error("PAYMENT_NOT_FOUND");
  }

  // 2. Allow retries if payment was already verified
  if (
  paymentRecord.status === "CAPTURED" &&
  paymentRecord.razorpayPaymentId === razorpayPaymentId &&
  paymentRecord.booking.status === "CONFIRMED"
) {
  return {
    message: "Payment already verified",
    bookingId,
    ticketCode: paymentRecord.booking.ticketCode,
    status: "CONFIRMED",
  };
}

  if (paymentRecord.status !== "CREATED") {
    throw new Error("PAYMENT_NOT_PENDING");
  }

  // 3. Verify Razorpay signature
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!secret) {
    throw new Error("PAYMENT_CONFIGURATION_ERROR");
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const receivedBuffer = Buffer.from(razorpaySignature, "hex");

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new Error("INVALID_PAYMENT_SIGNATURE");
  }

  // 4. Confirm payment directly with Razorpay
  const razorpayPayment =
    await razorpay.payments.fetch(razorpayPaymentId);

  if (
    razorpayPayment.order_id !== razorpayOrderId ||
    razorpayPayment.amount !== paymentRecord.amountPaise ||
    razorpayPayment.currency !== paymentRecord.currency ||
    razorpayPayment.status !== "captured"
  ) {
    throw new Error("PAYMENT_NOT_CAPTURED");
  }

  // 5. Confirm booking and capture payment atomically
  return prisma.$transaction(async (tx) => {
    const now = new Date();

const ticketCode = crypto.randomUUID();

const bookingUpdate = await tx.booking.updateMany({
  where: {
    id: bookingId,
    userId,
    status: "PENDING",
    expiresAt: { gt: now },
  },
  data: {
    status: "CONFIRMED",
    ticketCode,
  },
});

if (bookingUpdate.count !== 1) {
  throw new Error("BOOKING_EXPIRED_OR_NOT_PENDING");
}

if (bookingUpdate.count !== 1) {
  throw new Error("BOOKING_EXPIRED_OR_NOT_PENDING");
}

    

    const paymentUpdate = await tx.payment.updateMany({
      where: {
        id: paymentRecord.id,
        status: "CREATED",
        razorpayOrderId,
      },
      data: {
        status: "CAPTURED",
        razorpayPaymentId,
      },
    });

    if (paymentUpdate.count !== 1) {
      throw new Error("PAYMENT_ALREADY_PROCESSED");
    }

   return {
  message: "Payment verified successfully",
  bookingId,
  paymentId: razorpayPaymentId,
  ticketCode,
  status: "CONFIRMED",
};
  });
}
