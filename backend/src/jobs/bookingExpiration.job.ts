import cron from "node-cron";
import { expirePendingBookings } from "../modules/bookings/booking.service";

let isRunning = false;

export function startBookingExpirationJob() {
  cron.schedule("* * * * *", async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const expiredCount = await expirePendingBookings();
      if (expiredCount > 0) {
        console.log(`[ExpiryJob] Expired ${expiredCount} booking(s) and restored seats.`);
      }
    } catch (error) {
      console.error("[ExpiryJob] Booking expiration failed:", error);
    } finally {
      isRunning = false;
    }
  });

  console.log("Booking expiration job scheduled (every 1 minute).");
}