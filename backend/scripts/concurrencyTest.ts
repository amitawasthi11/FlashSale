import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { createBooking } from "../src/modules/bookings/booking.service";

async function runConcurrencyTest() {
  const TOTAL_SEATS = 5;
  const CONCURRENT_REQUESTS = 30;

  // 1. Grab any existing user (or create a temporary test user)
  let user = await prisma.user.findFirst();
  let createdTestUser = false;

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: "Load Test User",
        email: `loadtest_${Date.now()}@flashsale.local`,
        password: "hashed_dummy_password",
      },
    });
    createdTestUser = true;
  }

  // 2. Create a temporary event with strictly 5 seats
  const event = await prisma.event.create({
    data: {
      title: "Concurrency Stress Test Event",
      venue: "Test Arena",
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      totalSeats: TOTAL_SEATS,
      availableSeats: TOTAL_SEATS,
      priceInPaise: 50000,
    },
  });

  console.log(`\n🚀 Firing ${CONCURRENT_REQUESTS} simultaneous requests for ${TOTAL_SEATS} seats...\n`);

  const start = performance.now();

  // 3. Fire all 30 booking attempts at the exact same instant
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENT_REQUESTS }, async () => {
      const reqStart = performance.now();
      const booking = await createBooking({
        userId: user!.id,
        eventId: event.id,
        quantity: 1,
      });
      return {
        bookingId: booking.id,
        latencyMs: Math.round(performance.now() - reqStart),
      };
    })
  );

  const totalTimeMs = Math.round(performance.now() - start);

  // 4. Tally outcomes and latency
  const succeeded = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");

  const latencies = succeeded
    .map((r) => (r as PromiseFulfilledResult<{ latencyMs: number }>).value.latencyMs)
    .sort((a, b) => a - b);

  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;
  const p95Latency = latencies.length
    ? latencies[Math.floor(latencies.length * 0.95)]
    : 0;

  // 5. Inspect final database state
  const finalEvent = await prisma.event.findUniqueOrThrow({
    where: { id: event.id },
  });
  const bookingCount = await prisma.booking.count({
    where: { eventId: event.id, status: "PENDING" },
  });

  console.log("=== Concurrency Test Results ===");
  console.log(`Total Requests:      ${CONCURRENT_REQUESTS}`);
  console.log(`Succeeded Bookings:  ${succeeded.length} (Expected: ${TOTAL_SEATS})`);
  console.log(`Rejected Requests:   ${failed.length} (Expected: ${CONCURRENT_REQUESTS - TOTAL_SEATS})`);
  console.log(`Final Available:     ${finalEvent.availableSeats} (Expected: 0)`);
  console.log(`DB Booking Rows:     ${bookingCount} (Expected: ${TOTAL_SEATS})`);
  console.log(`Total Wall Time:     ${totalTimeMs} ms`);
  console.log(`Avg / P95 Latency:   ${avgLatency} ms / ${p95Latency} ms`);
  console.log(`Overselling Check:   ${finalEvent.availableSeats === 0 && bookingCount === TOTAL_SEATS ? "✅ PASSED (0 oversold)" : "❌ FAILED"}`);

  // 6. Clean up test records so your DB stays spotless
  await prisma.booking.deleteMany({ where: { eventId: event.id } });
  await prisma.event.delete({ where: { id: event.id } });
  if (createdTestUser) {
    await prisma.user.delete({ where: { id: user.id } });
  }

  await prisma.$disconnect();
}

runConcurrencyTest().catch(async (err) => {
  console.error("Test error:", err);
  await prisma.$disconnect();
  process.exit(1);
});