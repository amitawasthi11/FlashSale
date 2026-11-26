# FlashSale: High-Concurrency Event Ticketing & QR Gate Check-In

A full-stack event booking platform built to **prevent overselling under flash-sale traffic**, **process payment webhooks idempotently**, and **automatically release abandoned seat reservations**. It includes QR-based, single-use gate check-in for admins.

**Live Demo:** `<add Vercel URL>` · **API Health:** `<add Render URL>/api/health`
> The backend runs on a free tier, so the first request may take ~30 seconds to wake up.

<!-- Add 3-4 screenshots or a short GIF here: event list, checkout, My Tickets QR, gate scanner -->

---

## Problem

Basic CRUD ticketing apps break under sudden traffic in three predictable ways:

1. **Overselling.** A read-then-write seat check (`SELECT` then `UPDATE`) leaves a race window where concurrent users buy the same last seats.
2. **Zombie seat locks.** Users start checkout and close the tab. Without cleanup, those seats stay locked and revenue is lost.
3. **Lost or duplicated confirmations.** Relying only on the browser's payment callback loses paid bookings when the user drops offline. Gateways also retry webhooks, which can issue duplicate tickets.

## Solution

### 1. Atomic seat reservation
Seats are reserved inside a Prisma interactive transaction using a single conditional update:

- Decrement `availableSeats` **only if** `availableSeats >= quantity` and the event is not cancelled, in one SQL statement.
- If no row is updated, the transaction rolls back and the API returns `409 INSUFFICIENT_SEATS`.

The database enforces the inventory invariant. No application-level locks are needed.

### 2. Dual-path idempotent payments (Razorpay)
- **Server-authoritative pricing:** the order amount is computed from database prices (in paise), never from client input.
- **Two confirmation paths:** the checkout callback (`/api/payments/verify`, HMAC-SHA256 signature plus a direct fetch from Razorpay to check order, amount, currency and `captured` status), and the asynchronous `payment.captured` webhook (raw-body signature verification).
- **Idempotency:** both paths use conditional updates inside transactions. Duplicate webhooks or a verify/webhook race resolve to one confirmed booking, one captured payment and one ticket code.
- **Safe failure handling:** a captured payment for an expired or cancelled booking is never auto-confirmed. It is logged and flagged for reconciliation and manual refund review.

### 3. Self-healing reservation expiry
Each `PENDING` booking has a 10-minute window (`expiresAt`). A background job cancels expired bookings and restores their seats. Users can also cancel pending bookings manually.

### 4. RBAC and QR gate check-in
- JWT authentication with `USER` and `ADMIN` roles.
- Confirmed bookings get a unique UUID `ticketCode`, rendered as a QR code.
- Admins scan tickets with a camera scanner (manual code entry as a fallback). Check-in is a single atomic update, so each ticket is accepted once. Results: `VALID`, `ALREADY_USED`, `WRONG_EVENT`.

## Architecture

```text
Client (React + TS)
  |-- POST /api/bookings ---------> Prisma TX: conditional updateMany (availableSeats >= qty)
  |-- POST /api/payments/create-order --> Razorpay Orders API
  |-- POST /api/payments/verify --------> signature + Razorpay fetch --> confirm booking (TX)
  
Razorpay --> POST /api/payments/webhook --> raw-body HMAC verify --> idempotent confirm (TX)

Background job --> releases expired PENDING bookings and restores seats
```

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, Axios, `qrcode.react`, `html5-qrcode` |
| Backend | Node.js, Express, TypeScript, Prisma ORM, Zod, JWT, Helmet, CORS, `express-rate-limit` |
| Database | PostgreSQL |
| Payments | Razorpay Checkout and webhooks |
| Deployment | Vercel (frontend), Render (backend and PostgreSQL) |

## API Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| POST | `/api/bookings` | User | Reserve seats (atomic, 10-min hold) |
| GET | `/api/bookings/my-bookings` | User | List the user's bookings and tickets |
| POST | `/api/payments/create-order` | User | Create a Razorpay order for a pending booking |
| POST | `/api/payments/verify` | User | Verify checkout signature and confirm booking |
| POST | `/api/payments/webhook` | Razorpay | Handle `payment.captured` (signature verified) |

Booking cancellation, event management and check-in endpoints are also available. Add their exact routes here.

## Verification

Validated with an integration test suite (`<path to tests>`):

- **Concurrency:** 25 simultaneous booking requests against an event with 5 seats resulted in exactly 5 successes (`201`), 20 clean rejections (`409`), and `availableSeats` ending at `0`.
- **Webhook idempotency:** repeated `payment.captured` deliveries produced a single ticket with no duplicate state changes.
- **Check-in:** replayed scans return `ALREADY_USED`, and tickets scanned at another event return `WRONG_EVENT`.

Run the tests with `npm test` (adjust to your script name).

## Design Decisions

| Decision | Reason |
| :--- | :--- |
| Conditional `updateMany` instead of read-then-write | Closes the check-then-act race in one atomic statement, with no distributed locks |
| Verify endpoint **and** webhook | The browser callback can be lost; webhooks can be late. Either path alone is unreliable |
| Never auto-confirm expired bookings | Seats may already be resold, so the payment is flagged for refund review instead |
| Raw body on the webhook route only | HMAC verification needs the exact bytes Razorpay signed |

## Current Limitations & Future Roadmap

While FlashSale guarantees transactional consistency and zero overselling on a single-region deployment, scaling to massive stadium-scale flash sales introduces known trade-offs:

1. **Single-Row Database Contention at Extreme Scale:**
   - *Limitation:* Every concurrent booking acquires a row-level write lock on the target `Event` record in PostgreSQL. Under tens of thousands of requests per second for a single event, row-lock queuing increases tail latency (`p95`/`p99`).
   - *Planned Improvement:* Introduce a **Redis Lua atomic counter + BullMQ queue** layer to absorb burst traffic in memory and drain confirmed reservations asynchronously into PostgreSQL.

2. **In-Process Cron Scheduler on Multi-Instance Deployments:**
   - *Limitation:* The 10-minute reservation expiry cleanup currently runs inside the Node.js application process. Scaling horizontally across multiple backend replicas without leader election would trigger redundant cron sweeps.
   - *Planned Improvement:* Offload expiry cleanup to an external worker (`pg_cron` or a dedicated Redis-backed job scheduler) with distributed lock guarantees.

3. **Single Ticket Code per Multi-Seat Booking:**
   - *Limitation:* A multi-ticket booking (e.g., `quantity = 3`) currently generates one shared `ticketCode` QR admitting the entire group together, requiring group members to arrive at the gate at the same time.
   - *Planned Improvement:* Normalize tickets into a dedicated `Ticket` table so each seat receives an individual QR code for independent gate check-in and ticket transfers.

4. **General-Admission Inventory Model (No Seat Map):**
   - *Limitation:* Inventory is tracked as an aggregate integer (`availableSeats`) rather than numbered rows and seats.
   - *Planned Improvement:* Add interactive venue seat-map selection with per-seat state locking (`AVAILABLE` → `HELD` → `BOOKED`).

## Local Setup

**Prerequisites:** Node.js 20+, PostgreSQL 15+, Razorpay test keys.

```bash
git clone https://github.com/<your-username>/flashsale.git
cd flashsale

# Backend
cd backend
npm install
cp .env.example .env      # fill in values
npx prisma migrate dev
npm run dev               # http://localhost:5000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Environment variables (`backend/.env`)

```text
DATABASE_URL=
JWT_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
PORT=5000
```

To receive webhooks locally, expose port 5000 with a tunnel (for example ngrok) and register `<tunnel-url>/api/payments/webhook` in the Razorpay dashboard.

## Key Learnings

1. **Database constraints beat application locks** for inventory correctness.
2. **Webhook signatures need the raw body**, so the raw parser must be mounted before `express.json()`.
3. **Design for partial failure.** Treat the client callback as unreliable and back it with webhooks, expiry and reconciliation.

## Author

**Amit Awasthi**: `<LinkedIn>` · `<GitHub>` · `<email>`
