
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

    if (payment.status === "CAPTURED") {
      res.status(200).send("Already processed");
      return;
    }

    await prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.updateMany({
        where: { id: payment.id, status: "CREATED" },
        data: {
          status: "CAPTURED",
          razorpayPaymentId: paymentData.id,
        },
      });

      if (updatedPayment.count !== 1) return;

      const bookingUpdate = await tx.booking.updateMany({
        where: {
          id: payment.bookingId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        data: { status: "CONFIRMED" },
      });

      if (bookingUpdate.count !== 1) {
        console.error(
          "Captured payment needs booking reconciliation:",
          payment.bookingId
        );
      }
    });

    res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("Razorpay webhook failed:", error);
    res.status(500).send("Webhook processing failed");
  }
}
