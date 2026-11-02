
import cron from "node-cron";
import { expirePendingBookings } from "../modules/bookings/booking.service";

export function startBookingExpirationJob() {
  console.log("Expiration function:", typeof expirePendingBookings);

  cron.schedule("* * * * *", async () => {
    try {
      const result = await expirePendingBookings();

      console.log("Expiration result:", result);
      console.log("Result type:", typeof result);
    } catch (error) {
      console.error("Booking expiration job failed:", error);
    }
  });

  console.log("Booking expiration job started.");
}
