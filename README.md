# FlashSale — High-Concurrency Event Ticketing Platform

FlashSale is a full-stack event booking and ticketing platform built to handle concurrent seat reservations, idempotent Razorpay payments, and crash-safe state transitions without overselling inventory.

---

## Tech Stack

- **Backend:** Node.js, Express 5, TypeScript
- **Database & ORM:** PostgreSQL 18, Prisma ORM 7 (`@prisma/adapter-pg`)
- **Payments:** Razorpay Orders, Checkout Verification & Webhooks (HMAC-SHA256)
- **Security & Validation:** JWT Authentication, Role-Based Access Control (`USER` / `ADMIN`), `bcrypt`, `helmet`, `cors`, `express-rate-limit`, Zod
- **Background Jobs:** `node-cron` (automated 10-minute reservation expiry & seat restoration)

---

## Key Features Implemented

- **Authentication & Authorization:** JWT-based login/registration with normalized email checks, `bcrypt` password hashing, and admin-protected routes.
- **Event Management:** Full CRUD for admins with protection against deleting events with active bookings, lowering `totalSeats` below already booked seats, changing prices after tickets are sold, or leaving pending reservations open when an event is cancelled. Public event discovery supports pagination, sorting, search, and date/venue filtering.
- **Concurrency-Safe Seat Reservation:** Atomic conditional updates inside PostgreSQL transactions prevent overselling when multiple users book the last available seats simultaneously.
- **Razorpay Payment Integration & Reconciliation:**
  - Server-side order creation in paise (`INR`) with booking ownership and expiry validation.
  - Dual-path confirmation via frontend verification (`/api/payments/verify`) and asynchronous server webhooks (`/api/payments/webhook` with raw `Buffer` body parsing).
  - Idempotent webhook handling and unique UUID `ticketCode` generation.
  - Late-payment reconciliation: payments captured after a booking expires are safely logged with `failureReason` for refund review instead of overbooking the event.
- **Self-Healing Expiry Cleanup:** Unpaid `PENDING` bookings automatically expire after 10 minutes and return held seats to `availableSeats` via an overlap-guarded background cron job.

---

## System Architecture

### Request & Payment Flow

```text
┌──────────┐     1. POST /api/bookings      ┌───────────────────┐     Atomic Row Lock      ┌────────────┐
│  Client  │ ─────────────────────────────► │  Express API      │ ───────────────────────► │ PostgreSQL │
│          │ ◄───────────────────────────── │  (Node + TS)      │ ◄─────────────────────── │  (Prisma)  │
└──────────┘     PENDING Booking (10m TTL)  └─────────┬─────────┘     Decrement Seats      └─────┬──────┘
     │                                                │                                          │
     │ 2. Checkout (Razorpay SDK)                     │ 3. Create Order / Verify Signature       │
     ▼                                                ▼                                          │
┌──────────┐     4. payment.captured Webhook ┌───────────────────┐     Atomic Confirmation      │
│ Razorpay │ ─────────────────────────────► │  Webhook Handler  │ ─────────────────────────────┘
│ Gateway  │    (Raw Body + HMAC-SHA256)    │  (Idempotent)     │   CONFIRMED + UUID ticketCode
└──────────┘                                └───────────────────┘