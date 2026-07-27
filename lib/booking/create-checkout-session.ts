import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { stripe } from '../stripe/client';
import { db as defaultDb } from '../db/client';
import { bookings } from '../db/schema';
import { formatShowtime } from '../format';
import type { Booking, Movie, Showtime, Seat, TicketType } from '../types';

type Database = typeof defaultDb;

export function buildCheckoutSessionParams(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: Array<{ seat: Seat; ticketType: TicketType }>,
  siteUrl: string,
): Stripe.Checkout.SessionCreateParams {
  const quantityByTicketType = new Map<number, { ticketType: TicketType; quantity: number }>();
  for (const { ticketType } of seatDetails) {
    const existing = quantityByTicketType.get(ticketType.id);
    quantityByTicketType.set(ticketType.id, { ticketType, quantity: (existing?.quantity ?? 0) + 1 });
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = Array.from(quantityByTicketType.values()).map(
    ({ ticketType, quantity }) => ({
      quantity,
      price_data: {
        currency: 'usd',
        unit_amount: ticketType.priceCents,
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
    success_url: `${siteUrl}/book/success?booking_id=${booking.id}`,
    cancel_url: `${siteUrl}/book/${showtime.id}`,
  };
}

export async function createCheckoutSessionForBooking(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: Array<{ seat: Seat; ticketType: TicketType }>,
  db: Database = defaultDb,
): Promise<string> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const params = buildCheckoutSessionParams(booking, movie, showtime, seatDetails, siteUrl);

  const session = await stripe.checkout.sessions.create(params);

  if (!session.url) {
    throw new Error('Stripe did not return a Checkout Session URL');
  }

  await db.update(bookings).set({ stripeCheckoutSessionId: session.id }).where(eq(bookings.id, booking.id));

  return session.url;
}
