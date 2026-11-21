
import type { Request, Response } from "express";
import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";

export async function razorpayWebhook(req: Request, res: Response) {
  try {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).send("Raw body required");
      return;
    }

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.get("x-razorpay-signature");

    if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) {
      res.status(400).send("Invalid webhook signature");
      return;
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(req.body)
      .digest();

    const received = Buffer.from(signature, "hex");

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      res.status(400).send("Signature verification failed");
      return;
    }

    const event = JSON.parse(req.body.toString("utf8"));

    if (event.event !== "payment.captured") {
      res.status(200).send("Event ignored");
      return;
    }

    const paymentData = event.payload?.payment?.entity;

    if (
      !paymentData?.id ||
      !paymentData?.order_id ||
      paymentData.status !== "captured"
    ) {
      res.status(400).send("Invalid payment payload");
      return;
    }

    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId: paymentData.order_id },
      include: { booking: true },
    });

    if (!payment) {
      console.error("Webhook payment record not found:", paymentData.order_id);
      res.status(200).send("Payment record not found; logged for reconciliation");
      return;
    }

    if (
      payment.amountPaise !== paymentData.amount ||
      payment.currency !== paymentData.currency
    ) {
      console.error("Webhook payment amount/currency mismatch:", payment.id);
      res.status(200).send("Payment mismatch logged");
      return;
    }

    // if (payment.status === "CAPTURED") {
    //   res.status(200).send("Already processed");
    //   return;
    // }

  
const result = await prisma.$transaction(async (tx) => {
  const currentPayment = await tx.payment.findUnique({
    where: { id: payment.id },
  });

  const booking = await tx.booking.findUnique({
    where: { id: payment.bookingId },
  });

  if (!currentPayment || !booking) {
    throw new Error("PAYMENT_OR_BOOKING_NOT_FOUND");
  }

  // Reject a different payment ID for an already captured order.
  if (
    currentPayment.status === "CAPTURED" &&
    currentPayment.razorpayPaymentId !== paymentData.id
  ) {
    throw new Error("PAYMENT_ID_MISMATCH");
  }

  // Already confirmed: webhook retry is safe.
  if (
    currentPayment.status === "CAPTURED" &&
    booking.status === "CONFIRMED"
  ) {
    return "Already processed";
  }

  // If the booking is still pending and valid, confirm it
  // and generate the ticket code.
  if (
    booking.status === "PENDING" &&
    booking.expiresAt &&
    booking.expiresAt > new Date() &&
    !currentPayment.razorpayPaymentId
  ) {
    const ticketCode = booking.ticketCode ?? crypto.randomUUID();

    const bookingUpdate = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: {
        status: "CONFIRMED",
        ticketCode,
      },
    });

    if (bookingUpdate.count !== 1) {
      throw new Error("BOOKING_CONFIRMATION_RACE");
    }
  } else if (
    booking.status === "PENDING" &&
    booking.expiresAt &&
    booking.expiresAt > new Date() &&
    currentPayment.status === "CAPTURED"
  ) {
    // A previous webhook may have captured payment without
    // confirming the booking. Retry confirmation safely.
    const ticketCode = booking.ticketCode ?? crypto.randomUUID();

    const bookingUpdate = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: {
        status: "CONFIRMED",
        ticketCode,
      },
    });

    if (bookingUpdate.count !== 1) {
      throw new Error("BOOKING_CONFIRMATION_RACE");
    }
  } else if (
    booking.status !== "CONFIRMED" ||
    currentPayment.status !== "CAPTURED"
  ) {
    // The payment may have succeeded after booking expiry.
    // Record the captured payment for reconciliation, but
    // never confirm an expired or cancelled booking.
    if (currentPayment.status === "CREATED") {
      await tx.payment.updateMany({
        where: {
          id: currentPayment.id,
          status: "CREATED",
        },
        data: {
          status: "CAPTURED",
          razorpayPaymentId: paymentData.id,
        },
      });
    }

    return "RECONCILIATION_REQUIRED";
  }

  if (currentPayment.status === "CREATED") {
    const paymentUpdate = await tx.payment.updateMany({
      where: {
        id: currentPayment.id,
        status: "CREATED",
      },
      data: {
        status: "CAPTURED",
        razorpayPaymentId: paymentData.id,
      },
    });

    if (paymentUpdate.count !== 1) {
      throw new Error("PAYMENT_UPDATE_RACE");
    }
  }

  return "Webhook processed";
});

if (result === "RECONCILIATION_REQUIRED") {
  console.error(
    "Captured payment needs reconciliation/refund review:",
    payment.bookingId
  );
}

console.log("Razorpay webhook result:", result);
res.status(200).send(result);

    // console.log("🔥 RAZORPAY WEBHOOK RECEIVED");
    // res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("Razorpay webhook failed:", error);
    res.status(500).send("Webhook processing failed");
  }
}
