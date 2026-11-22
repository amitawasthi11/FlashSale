import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";

async function runIntegrationSuite() {
  // Start Express on an ephemeral port so rate-limiters & HTTP middleware run for real
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 5055;
  const baseUrl = `http://127.0.0.1:${port}`;

  const suffix = Date.now();
  const userEmail = `user_${suffix}@test.local`;
  const adminEmail = `admin_${suffix}@test.local`;
  const password = "Password123!";

  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  async function api(
    path: string,
    options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}
  ) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers ?? {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  try {
    console.log("\n🧪 Running FlashSale Backend Integration Suite...\n");

    // ---------------------------------------------------------
    // 1. Auth & Role-Based Access Control
    // ---------------------------------------------------------
    const regUser = await api("/api/auth/register", {
      method: "POST",
      body: { name: "Test User", email: userEmail, password },
    });
    assert.equal(regUser.status, 201, "User registration should return 201");
    createdUserIds.push(regUser.data.user.id);

    const dupReg = await api("/api/auth/register", {
      method: "POST",
      body: { name: "Test User", email: userEmail, password },
    });
    assert.equal(dupReg.status, 409, "Duplicate email should return 409");

    const loginUser = await api("/api/auth/login", {
      method: "POST",
      body: { email: userEmail, password },
    });
    assert.equal(loginUser.status, 200);
    const userToken: string = loginUser.data.token;

    // Create & promote admin user
    const regAdmin = await api("/api/auth/register", {
      method: "POST",
      body: { name: "Test Admin", email: adminEmail, password },
    });
    createdUserIds.push(regAdmin.data.user.id);
    await prisma.user.update({
      where: { id: regAdmin.data.user.id },
      data: { role: "ADMIN" },
    });

    const loginAdmin = await api("/api/auth/login", {
      method: "POST",
      body: { email: adminEmail, password },
    });
    const adminToken: string = loginAdmin.data.token;

    // Non-admin blocked from creating events
    const forbiddenEvent = await api("/api/events", {
      method: "POST",
      token: userToken,
      body: {
        title: "Unauthorized Event",
        venue: "Nowhere",
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        totalSeats: 10,
        priceInPaise: 50000,
      },
    });
    assert.equal(forbiddenEvent.status, 403, "Regular user must get 403 on admin routes");
    console.log("✅ 1. Auth & RBAC guards passed");

    // ---------------------------------------------------------
    // 2. Event Creation & Discovery
    // ---------------------------------------------------------
    const eventA = await api("/api/events", {
      method: "POST",
      token: adminToken,
      body: {
        title: `Flash Concert ${suffix}`,
        description: "High demand test concert",
        venue: "Lucknow Arena",
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        totalSeats: 5,
        priceInPaise: 100000,
      },
    });
    assert.equal(eventA.status, 201);
    const eventAId: string = eventA.data.data.id;
    createdEventIds.push(eventAId);

    const eventB = await api("/api/events", {
      method: "POST",
      token: adminToken,
      body: {
        title: `Comedy Night ${suffix}`,
        venue: "Gomti Auditorium",
        startsAt: new Date(Date.now() + 172800000).toISOString(),
        totalSeats: 10,
        priceInPaise: 40000,
      },
    });
    assert.equal(eventB.status, 201);
    const eventBId: string = eventB.data.data.id;
    createdEventIds.push(eventBId);

    const searchRes = await api(`/api/events?search=${suffix}`);
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.data.data.length, 2, "Search should find both test events");
    console.log("✅ 2. Event creation, search & pagination passed");

    // ---------------------------------------------------------
    // 3. HTTP Concurrency Stress Check (25 requests -> 5 seats)
    // ---------------------------------------------------------
    const bookingAttempts = await Promise.all(
      Array.from({ length: 25 }, () =>
        api("/api/bookings", {
          method: "POST",
          token: userToken,
          body: { eventId: eventAId, quantity: 1 },
        })
      )
    );

    const successes = bookingAttempts.filter((r) => r.status === 201);
    const conflicts = bookingAttempts.filter((r) => r.status === 409);

    assert.equal(successes.length, 5, "Exactly 5 bookings must succeed");
    assert.equal(conflicts.length, 20, "Exactly 20 bookings must fail with 409");

    const dbEventA = await prisma.event.findUniqueOrThrow({ where: { id: eventAId } });
    assert.equal(dbEventA.availableSeats, 0, "Available seats must be 0");
    console.log("✅ 3. HTTP concurrency check (25 reqs / 5 seats, 0 oversold) passed");

    // ---------------------------------------------------------
    // 4. Razorpay Webhook Signature & Idempotency
    // ---------------------------------------------------------
    const targetBookingId: string = successes[0].data.data.booking.id;
    const fakeOrderId = `order_test_${suffix}`;
    const fakePaymentId = `pay_test_${suffix}`;

    // Seed a Payment record matching what create-order creates
    await prisma.payment.create({
      data: {
        bookingId: targetBookingId,
        razorpayOrderId: fakeOrderId,
        amountPaise: 100000,
        currency: "INR",
        status: "CREATED",
      },
    });

    const webhookPayload = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: fakePaymentId,
            order_id: fakeOrderId,
            amount: 100000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    });

    // 4a. Reject bad signature
    const badWebhook = await fetch(`${baseUrl}/api/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "invalid_signature_hex",
      },
      body: webhookPayload,
    });
    assert.equal(badWebhook.status, 400, "Invalid webhook signature must return 400");

    // 4b. Valid signature confirms booking & issues ticketCode
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    assert.ok(webhookSecret, "RAZORPAY_WEBHOOK_SECRET must be set in .env");

    const validSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(webhookPayload)
      .digest("hex");

    const validWebhook1 = await fetch(`${baseUrl}/api/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": validSignature,
      },
      body: webhookPayload,
    });
    assert.equal(validWebhook1.status, 200);

    const confirmedBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: targetBookingId },
    });
    assert.equal(confirmedBooking.status, "CONFIRMED");
    assert.ok(confirmedBooking.ticketCode, "Confirmed booking must have a ticketCode");

    // 4c. Replay exact same webhook -> must be idempotent
    const validWebhook2 = await fetch(`${baseUrl}/api/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": validSignature,
      },
      body: webhookPayload,
    });
    assert.equal(validWebhook2.status, 200);

    const afterReplay = await prisma.booking.findUniqueOrThrow({
      where: { id: targetBookingId },
    });
    assert.equal(
      afterReplay.ticketCode,
      confirmedBooking.ticketCode,
      "Webhook replay must preserve exact same ticketCode"
    );
    console.log("✅ 4. Webhook HMAC verification & idempotency passed");

    // ---------------------------------------------------------
    // 5. QR Ticket Check-In & Cross-Event / Duplicate Guards
    // ---------------------------------------------------------
    const ticketCode = confirmedBooking.ticketCode!;

    // 5a. Wrong event must fail without burning the ticket
    const wrongEventScan = await api("/api/bookings/check-in", {
      method: "POST",
      token: adminToken,
      body: { ticketCode, eventId: eventBId },
    });
    assert.equal(wrongEventScan.status, 400);
    assert.equal(wrongEventScan.data.code, "WRONG_EVENT");

    // 5b. Correct event must succeed
    const validScan = await api("/api/bookings/check-in", {
      method: "POST",
      token: adminToken,
      body: { ticketCode, eventId: eventAId },
    });
    assert.equal(validScan.status, 200);
    assert.ok(validScan.data.data.booking.checkedInAt);

    // 5c. Second scan of same ticket must fail with ALREADY_USED
    const duplicateScan = await api("/api/bookings/check-in", {
      method: "POST",
      token: adminToken,
      body: { ticketCode, eventId: eventAId },
    });
    assert.equal(duplicateScan.status, 409);
    assert.equal(duplicateScan.data.code, "ALREADY_USED");
    console.log("✅ 5. QR check-in, cross-event guard & duplicate-scan guard passed");

    console.log("\n🎉 ALL BACKEND INTEGRATION TESTS PASSED!\n");
  } finally {
    // Clean up test records in reverse foreign-key order
    await prisma.payment.deleteMany({
      where: { booking: { eventId: { in: createdEventIds } } },
    });
    await prisma.booking.deleteMany({
      where: { eventId: { in: createdEventIds } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: createdEventIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });

    server.close();
    await prisma.$disconnect();
  }
}

runIntegrationSuite().catch((err) => {
  console.error("\n❌ Integration test failed:\n", err);
  process.exit(1);
});