import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { stripe } from '../stripe/client';
import { db as defaultDb } from '../db/client';
import { bookings } from '../db/schema';
import { formatShowtime } from '../format';
import { resolveSiteUrl } from '../site-url';
import { releaseBookingHold } from './create-booking';
import type { Booking, Movie, Showtime, Seat, TicketType } from '../types';

type Database = typeof defaultDb;

export type BookingSeatDetail = { seat: Seat; ticketType: TicketType; priceCents: number };

// Stripe's documented minimum Checkout Session lifetime. The booking flow
// tracks its own 10-minute `held_until`, and the design only tolerates a
// customer paying against a lapsed hold because Stripe's own session dies
// shortly after. Stripe's *default* is 24 hours, which would widen that
// "vanishingly rare" race into an hours-long window, so pin it to the minimum.
const SESSION_LIFETIME_SECONDS = 30 * 60;

export function buildCheckoutSessionParams(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: BookingSeatDetail[],
  siteUrl: string,
): Stripe.Checkout.SessionCreateParams {
  // Group by ticket type *and* snapshot price. The label comes from the ticket
  // type, but `unit_amount` must be `booking_seats.price_cents` — the price
  // captured when the booking was created — not `ticket_types.price_cents`,
  // which is live and may have changed since. Charging the live price would
  // disagree with `bookings.total_cents` and with the confirmation email.
  // Including the price in the grouping key means a booking that somehow holds
  // two different snapshot prices for one ticket type still bills each of them
  // correctly instead of silently collapsing onto one.
  const groups = new Map<string, { ticketType: TicketType; priceCents: number; quantity: number }>();
  for (const { ticketType, priceCents } of seatDetails) {
    const key = `${ticketType.id}:${priceCents}`;
    const existing = groups.get(key);
    groups.set(key, { ticketType, priceCents, quantity: (existing?.quantity ?? 0) + 1 });
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = Array.from(groups.values()).map(
    ({ ticketType, priceCents, quantity }) => ({
      quantity,
      price_data: {
        currency: 'usd',
        unit_amount: priceCents,
        product_data: {
          name: `${ticketType.label} ticket — ${movie.title} (${formatShowtime(showtime.startTime)})`,
        },
      },
    }),
  );

  return {
    mode: 'payment',
    customer_email: booking.customerEmail,
    line_items: lineItems,
    metadata: { bookingId: String(booking.id) },
    expires_at: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
    success_url: `${siteUrl}/book/success?booking_id=${booking.id}`,
    cancel_url: `${siteUrl}/book/${showtime.id}`,
  };
}

function sumLineItems(lineItems: Stripe.Checkout.SessionCreateParams.LineItem[]): number {
  return lineItems.reduce((sum, item) => {
    const unitAmount = item.price_data?.unit_amount ?? 0;
    return sum + unitAmount * (item.quantity ?? 0);
  }, 0);
}

export async function createCheckoutSessionForBooking(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: BookingSeatDetail[],
  db: Database = defaultDb,
): Promise<string> {
  const siteUrl = resolveSiteUrl();
  const params = buildCheckoutSessionParams(booking, movie, showtime, seatDetails, siteUrl);

  // `bookings.total_cents` (shown on screen and in the confirmation email) and
  // the Stripe line items are derived by two different code paths from the same
  // snapshot. If they ever disagree, the customer is charged something other
  // than what they were quoted, so fail loudly here rather than take the
  // payment and reconcile after the fact.
  const lineItemTotal = sumLineItems(params.line_items ?? []);
  if (lineItemTotal !== booking.totalCents) {
    throw new Error(
      `Checkout line-item total (${lineItemTotal}) does not match booking total (${booking.totalCents}) for booking ${booking.id}`,
    );
  }

  const session = await stripe.checkout.sessions.create(params);

  if (!session.url) {
    throw new Error('Stripe did not return a Checkout Session URL');
  }

  await db.update(bookings).set({ stripeCheckoutSessionId: session.id }).where(eq(bookings.id, booking.id));

  return session.url;
}

/**
 * Create the Checkout Session for a freshly created pending booking, and make
 * sure a failure never strands seats.
 *
 * If `createCheckoutSessionForBooking` throws — Stripe outage, rate limit, a
 * `customer_email` Stripe rejects, or the total-mismatch guard above — the
 * booking that was created moments earlier is unpayable: there is no session
 * for the customer to complete. Leaving it alone would keep its seats held for
 * the rest of the 10-minute window for a purchase that can never happen, so
 * release the hold right away and report a clean failure to the caller.
 */
export async function startCheckoutForBooking(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: BookingSeatDetail[],
  db: Database = defaultDb,
): Promise<{ ok: true; url: string } | { ok: false }> {
  try {
    const url = await createCheckoutSessionForBooking(booking, movie, showtime, seatDetails, db);
    return { ok: true, url };
  } catch (err) {
    console.error('Failed to create Stripe Checkout Session for booking', booking.id, err);
    try {
      await releaseBookingHold(booking.id, db);
    } catch (releaseErr) {
      // Best effort — if this fails too, the hold still lapses on its own.
      console.error('Failed to release seat hold for booking', booking.id, releaseErr);
    }
    return { ok: false };
  }
}
