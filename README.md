# FlashSale — High-Concurrency Event Ticketing & Gate Verification Platform

A full-stack event booking and QR-based gate check-in platform engineered to prevent ticket overselling under flash-sale traffic spikes, handle asynchronous payment webhooks idempotently, and self-heal abandoned seat reservations.

> **Live Demo:** `[Add your Vercel URL here]` · **API Health:** `[Add your Render URL/api/health here]`

---

## Problem Statement

Standard CRUD ticketing applications fail under sudden flash-sale traffic in three predictable ways:

1. **Race Conditions & Overselling:** When dozens of users attempt to book the last few tickets simultaneously, a naive `SELECT availableSeats` followed by `UPDATE availableSeats` creates a check-then-act race window, selling more tickets than physical venue capacity.
2. **Zombie Seat Locks:** Users frequently initiate checkout and close the browser tab without paying. Without automated cleanup, those seats remain locked indefinitely and reduce real revenue.
3. **Dropped Confirmations & Duplicate Webhooks:** Relying solely on frontend payment callbacks loses paid bookings if a user loses network connectivity right after UPI/card deduction, while payment gateways routinely retry webhooks and risk issuing duplicate tickets.

---

## Engineering Approach & Architecture

### 1. Atomic Seat Reservation (Zero Overselling)
Instead of application-level locks or optimistic read-then-write checks, seat deduction is executed inside a **Prisma interactive PostgreSQL transaction** using a conditional atomic `updateMany`:
- Decrements `availableSeats` **only if** `availableSeats >= quantity` and `isCancelled = false` in a single database statement.
- If `count === 0`, the transaction immediately rolls back and returns a clean `409 Conflict` (`INSUFFICIENT_SEATS`), guaranteeing strict inventory invariants even under heavy concurrent load.

### 2. Dual-Path Idempotent Payment Pipeline (Razorpay)
- **Server-Authoritative Pricing:** Order amounts are computed strictly from database ticket prices in paise—never trusted from client payloads.
- **Frontend Signature Verification + Async Webhooks:** Bookings confirm via either HMAC-SHA256 signature verification (`/api/payments/verify`) or Razorpay's asynchronous `payment.captured` webhook (`/api/payments/webhook` using raw request body verification).
- **Idempotency Guards:** Repeated webhook deliveries or concurrent verify calls detect already-confirmed bookings/payments and return safely without double-decrementing inventory or regenerating ticket UUIDs.

### 3. Self-Healing Reservation Expiry Worker
- Every `PENDING` booking receives a **10-minute reservation window** (`expiresAt`).
- A background scheduler periodically scans expired `PENDING` bookings, marks them `CANCELLED`, and atomically restores `availableSeats` back to the event pool. Users can also manually cancel pending reservations immediately from **My Tickets**.

### 4. Role-Based Access Control & Gate QR Check-In
- JWT authentication with `USER` and `ADMIN` roles.
- Confirmed bookings generate a unique `ticketCode` rendered as a high-error-correction QR code (`qrcode.react`).
- Admins access an integrated **Gate Scanner Console** (`html5-qrcode` camera scanner + manual UUID fallback) that enforces single-use entry and event-specific validation (`VALID`, `ALREADY_USED`, `WRONG_EVENT`).

```text
[Client (React 19 + TS)]
       │
       ├──► POST /api/bookings ──► [Prisma TX: atomic updateMany(availableSeats >= qty)]
       │                                      │
       ├──► POST /api/payments/create-order ──┼──► [Razorpay Orders API]
       │                                      │
       ├──► POST /api/payments/verify ────────┤
       │                                      ▼
       │    [Razorpay Webhook] ──────► [HMAC-SHA256 Verify + Idempotent Confirm + UUID Ticket]
       │                                      │
       └──► [Cron Expiry Worker] ────► [Releases expired PENDING seats after 10 mins]

       ## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Axios, Lucide Icons, `qrcode.react`, `html5-qrcode` |
| **Backend** | Node.js, Express, TypeScript, Prisma ORM, `express-rate-limit`, Helmet, CORS |
| **Database** | PostgreSQL |
| **Payments** | Razorpay Checkout & HMAC-SHA256 Webhooks |
| **Deployment** | Vercel (Frontend), Render (Backend Web Service + Managed PostgreSQL) |

---

## Results & Verification

The backend was validated against an automated end-to-end integration suite covering authentication, RBAC boundaries, payment signature/webhook idempotency, gate check-in guards, and HTTP concurrency stress testing:

- **0% Overselling Under Concurrent Load:** Fired **25 simultaneous HTTP booking requests** against an event with **5 available seats**—exactly **5 bookings succeeded (`201 Created`)**, **20 failed cleanly (`409 Conflict`)**, and `availableSeats` settled at **`0`** (never negative).
- **100% Webhook Idempotency:** Simulated duplicate `payment.captured` webhook deliveries and verified single-ticket issuance with zero duplicate state mutations.
- **Single-Use Gate Security:** Verified that scanned tickets transition atomically to `checkedInAt` timestamps, blocking replay scans (`ALREADY_USED`) and cross-event ticket reuse (`WRONG_EVENT`).

---

## Key Engineering Learnings

1. **Database Constraints Beat Application Locks:** Moving inventory checks into an atomic SQL `UPDATE ... WHERE available_seats >= qty` eliminated race conditions without introducing distributed lock complexity.
2. **Raw Body Preservation for Webhooks:** Mounting `express.raw({ type: 'application/json' })` specifically on the webhook route before global `express.json()` parsing is essential for exact HMAC-SHA256 signature verification.
3. **Designing for Partial Failure:** Treating client checkout completion as unreliable—and backing it up with both asynchronous webhooks and timed reservation rollbacks—ensures consistency even when users drop off mid-payment.

---

## Local Setup

### Prerequisites
- Node.js v20+
- PostgreSQL 15+
- Razorpay Test API Keys

### 1. Clone & Install

```bash
git clone [https://github.com/](https://github.com/)<your-username>/flashsale.git
cd flashsale

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install

Run Migrations & Start Servers
# Terminal 1 — Backend
cd backend
npx prisma migrate dev
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev