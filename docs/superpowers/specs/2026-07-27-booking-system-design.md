# RetfenyMozi: Booking System

## Context

RetfenyMozi (a single-screen local cinema) currently has a public site — movie
listings, showtimes, about/contact — with no way to actually reserve a seat.
This is sub-project 2 of the original decomposition: the booking system
(seat selection, reservations, payments, transactional email). Sub-project 1
(the walking skeleton + CI/CD pipeline) and a visual design pass are both
complete, merged, and live at https://reti-feny-cinema.vercel.app/ with real
seeded movies.

## Goal

Let a customer pick a showtime, select specific seats on a real seat map,
choose ticket types (Adult/Child/Senior), pay via Stripe, and receive a
confirmation email with a working cancellation link — without needing an
account.

## Scope

- Guest checkout only. User accounts ("my bookings", login) are explicitly
  out of scope — a future sub-project, once this ships and works end to end.
- Assigned seating on the cinema's one physical room: 8 rows × 5+5 seats
  (80 seats total) with a center aisle, plus a small number of accessible
  seats. The room's physical layout is fixed and shared across every
  showtime — it is not per-movie or per-showtime data.
- Three ticket types: Adult, Child, Senior, each with its own price.
- Cancellation (with Stripe refund) is in scope, via a link in the
  confirmation email. No cancellation UI elsewhere on the site.
- Payment via Stripe Checkout (Stripe's hosted, redirect-based payment
  page) — not a custom-built payment form (Stripe Elements). Checkout
  handles PCI compliance, card entry, and 3D Secure; a custom Elements-based
  form would require reimplementing all of that for no proportional payoff
  in a portfolio project.

## Data Model

- `seats`: `id, row (text), seat_number (int), is_accessible (bool)`.
  Seeded once via a migration/seed script — 80 rows, fixed for the life of
  the cinema. Not tied to any specific movie or showtime.
- `ticket_types`: `id, code ('adult' | 'child' | 'senior'), label, price_cents`.
  A table rather than a hardcoded constant, so prices can change without a
  code deploy.
- `bookings`: `id, showtime_id (FK -> showtimes.id), customer_name,
  customer_email, status ('pending' | 'confirmed' | 'cancelled'),
  held_until (timestamp, nullable), stripe_checkout_session_id,
  stripe_payment_intent_id (nullable until payment completes),
  cancellation_token (unique), total_cents, created_at, confirmed_at
  (nullable), cancelled_at (nullable)`.
- `booking_seats`: `id, booking_id (FK -> bookings.id), seat_id (FK ->
  seats.id), ticket_type_id (FK -> ticket_types.id), price_cents` — price
  is snapshotted at booking time so a later price change never retroactively
  affects a past booking.

**Seat availability** for a showtime = all 80 seats, minus any seat joined
(via `booking_seats`) to a booking for that showtime that is either
`confirmed`, or `pending` with `held_until` still in the future. A seat
whose only claim is an expired `pending` hold is available again — this is
computed at query time, not maintained by a background job.

## Payment & Seat Holds

Stripe Checkout Sessions have a **30-minute minimum** expiration — Stripe
does not allow a shorter session lifetime. Since the seat hold must be 10
minutes, hold expiry is tracked independently in our own database
(`bookings.held_until`), not via Stripe's session expiration. This means:

- No background cleanup job is needed. A held seat simply becomes
  available again the instant anything queries availability after
  `held_until` has passed.
- Edge case: a customer whose 10-minute hold has expired could still
  complete payment before Stripe's own 30-minute session dies (e.g. if
  another customer claimed the same seat in between). The webhook handler
  re-validates that the booking's seats are still exclusively held by this
  booking before confirming; if not, the booking is not confirmed and is
  flagged for manual follow-up rather than silently overbooking or silently
  failing. This is expected to be vanishingly rare in practice.

**Confirmation is driven by the Stripe webhook** (`checkout.session.completed`),
not by the browser redirect back to the site — the redirect is not a
reliable signal (the customer could close the tab, lose connectivity, or
the redirect could simply not fire), so the webhook is the single source of
truth for "payment succeeded."

## Booking Flow & Pages

- **`app/movies/[id]/page.tsx` (existing, modified):** each showtime becomes
  a link to its booking page, instead of plain text.
- **`app/book/[showtimeId]/page.tsx` (new):** shows the seat map (available
  / taken / held-by-someone-else, computed live), Adult/Child/Senior
  quantity steppers, and lets the customer click seats up to the total
  quantity selected. "Continue to payment" is enabled once the number of
  selected seats matches the ticket count.
- On submit, a server action: (1) re-validates seat availability inside a
  DB transaction, (2) creates a `pending` booking (`held_until = now() +
  10 minutes`) with its `booking_seats` rows, (3) creates a Stripe Checkout
  Session for the total, (4) redirects the customer to Stripe's hosted
  payment page.
- **`app/book/success/page.tsx` (new):** where Stripe redirects after
  payment. Shows "Thanks — check your email for your confirmation," not a
  claim that the booking is confirmed — confirmation happens via the
  webhook, which may not have finished processing at the instant of
  redirect.
- **`app/api/webhooks/stripe/route.ts` (new):** verifies the Stripe webhook
  signature, handles `checkout.session.completed` — re-validates the seats
  (per the edge case above), marks the booking `confirmed`, sets
  `confirmed_at`, generates `cancellation_token`, and sends the
  confirmation email via Resend (movie, showtime, seats, ticket types,
  total, cancellation link).
- **`app/booking/cancel/[token]/page.tsx` (new):** shows the booking's
  details with a "Cancel booking" button. Confirming calls the Stripe
  refund API; only on refund success does the booking become `cancelled`
  (freeing its seats immediately) — a failed refund leaves the booking
  `confirmed` and shows an error, never a false "cancelled" state with no
  refund issued. Cancelling a booking whose showtime has already passed is
  disallowed. Re-visiting an already-cancelled booking's link shows
  "already cancelled" rather than erroring or double-refunding.

## Error Handling

- **Concurrent seat selection:** the booking transaction re-checks
  availability before inserting; a losing customer sees a clear "that seat
  was just taken" message and returns to seat selection — never a silent
  double-booking.
- **Abandoned checkout:** no explicit cleanup required; the seats become
  available again once `held_until` passes, since availability is always
  computed live rather than cached.
- **Webhook signature failure:** rejected with HTTP 400, nothing is
  confirmed, logged for visibility.
- **Refund failure:** booking stays `confirmed`; customer sees an error
  rather than a false cancellation.

## Testing

- **Unit:** price calculation (ticket-type mix → total), seat-availability
  computation given a mix of confirmed/pending/expired/cancelled bookings.
- **Integration:** the booking transaction under concurrent seat claims
  (real Postgres, asserting the losing claim fails cleanly, not with a
  corrupted booking); the webhook handler invoked directly with a
  constructed Stripe event payload (not a live Stripe API call) to verify
  confirmation and the email-trigger logic; the cancellation flow,
  including the "already cancelled" and "refund failed" paths.
- **E2E:** the booking page through seat selection and the redirect to a
  Stripe Checkout URL. Full payment cannot be reliably driven through
  Stripe's real hosted page inside an automated test (it's a third-party
  domain), so E2E coverage stops at the redirect boundary; the
  confirmation/email path is covered by the webhook integration test
  instead of full E2E.

## Out of Scope

- User accounts, login, "my bookings" — a future sub-project.
- Any ticket type beyond Adult/Child/Senior.
- Cancellation/refund UI anywhere other than the emailed link.
- Seat map layouts other than the fixed 8×(5+5) room (no per-showtime or
  per-movie seating configuration).
- Background jobs for hold cleanup (handled by live computation instead).
