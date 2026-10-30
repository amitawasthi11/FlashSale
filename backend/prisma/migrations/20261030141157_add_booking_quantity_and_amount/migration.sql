-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "totalAmountPaise" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "quantity" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "availableSeats" DROP DEFAULT;
