import { describe, it, expect } from 'vitest';
import { buildCheckoutSessionParams, type BookingSeatDetail } from '../../lib/booking/create-checkout-session';
import type { Booking, Movie, Showtime } from '../../lib/types';

const movie: Movie = {
  id: 1,
  tmdbId: 27205,
  imdbId: 'tt1375666',
  title: 'Inception',
  synopsis: 'A thief who steals corporate secrets.',
  posterUrl: null,
  runtime: 148,
  director: 'Christopher Nolan',
  actors: ['Leonardo DiCaprio'],
  imdbRating: 8.8,
  trailerUrl: null,
};

const showtime: Showtime = { id: 10, movieId: 1, startTime: new Date('2026-08-01T18:00:00Z') };

const booking: Booking = {
  id: 5,
  showtimeId: 10,
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  status: 'pending',
  heldUntil: new Date(Date.now() + 10 * 60 * 1000),
  stripeCheckoutSessionId: null,
  stripePaymentIntentId: null,
  cancellationToken: 'token-abc',
  totalCents: 2000,
  createdAt: new Date(),
  confirmedAt: null,
  cancelledAt: null,
};

// `priceCents` is the per-seat snapshot taken from booking_seats at booking
// creation; `ticketType.priceCents` is the live catalogue price. They agree
// here, and deliberately disagree in the price-drift test below.
const seatDetails: BookingSeatDetail[] = [
  {
    seat: { id: 1, row: 'A', seatNumber: 1, isAccessible: false },
    ticketType: { id: 1, code: 'adult', label: 'Adult', priceCents: 1200 },
    priceCents: 1200,
  },
  {
    seat: { id: 2, row: 'A', seatNumber: 2, isAccessible: false },
    ticketType: { id: 2, code: 'child', label: 'Child', priceCents: 800 },
    priceCents: 800,
  },
];

function unitAmountOf(item: { price_data?: { unit_amount?: number | null } }): number | null | undefined {
  return item.price_data?.unit_amount;
}

describe('buildCheckoutSessionParams', () => {
  it('creates one line item per ticket type with the correct quantity and price', () => {
    const params = buildCheckoutSessionParams(booking, movie, showtime, seatDetails, 'https://example.com');

    expect(params.mode).toBe('payment');
    expect(params.customer_email).toBe('jane@example.com');
    expect(params.metadata).toEqual({ bookingId: '5' });
    expect(params.success_url).toBe('https://example.com/book/success?booking_id=5');
    expect(params.cancel_url).toBe('https://example.com/book/10');

    expect(params.line_items).toHaveLength(2);
    const adultLine = params.line_items!.find((li) => (li.price_data as { product_data: { name: string } }).product_data.name.includes('Adult'));
    expect(adultLine).toMatchObject({ quantity: 1, price_data: { currency: 'usd', unit_amount: 1200 } });
    const childLine = params.line_items!.find((li) => (li.price_data as { product_data: { name: string } }).product_data.name.includes('Child'));
    expect(childLine).toMatchObject({ quantity: 1, price_data: { currency: 'usd', unit_amount: 800 } });
  });

  it('groups multiple seats of the same ticket type into one line item with quantity > 1', () => {
    const twoAdults: BookingSeatDetail[] = [
      {
        seat: { id: 1, row: 'A', seatNumber: 1, isAccessible: false },
        ticketType: { id: 1, code: 'adult', label: 'Adult', priceCents: 1200 },
        priceCents: 1200,
      },
      {
        seat: { id: 2, row: 'A', seatNumber: 2, isAccessible: false },
        ticketType: { id: 1, code: 'adult', label: 'Adult', priceCents: 1200 },
        priceCents: 1200,
      },
    ];

    const params = buildCheckoutSessionParams(booking, movie, showtime, twoAdults, 'https://example.com');

    expect(params.line_items).toHaveLength(1);
    expect(params.line_items![0]).toMatchObject({ quantity: 2, price_data: { unit_amount: 1200 } });
  });

  it('charges the price snapshotted at booking time, not the current ticket-type price', () => {
    // The catalogue price rose to 1500 after this booking was created; the
    // customer was quoted — and bookings.total_cents records — the 1200 that
    // was snapshotted into booking_seats.price_cents.
    const priceRaisedSinceBooking: BookingSeatDetail[] = [
      {
        seat: { id: 1, row: 'A', seatNumber: 1, isAccessible: false },
        ticketType: { id: 1, code: 'adult', label: 'Adult', priceCents: 1500 },
        priceCents: 1200,
      },
    ];

    const params = buildCheckoutSessionParams(booking, movie, showtime, priceRaisedSinceBooking, 'https://example.com');

    expect(params.line_items).toHaveLength(1);
    expect(unitAmountOf(params.line_items![0])).toBe(1200);
  });

  it('expires the session after 30 minutes rather than Stripe’s 24-hour default', () => {
    const before = Math.floor(Date.now() / 1000);
    const params = buildCheckoutSessionParams(booking, movie, showtime, seatDetails, 'https://example.com');
    const after = Math.floor(Date.now() / 1000);

    expect(params.expires_at).toBeGreaterThanOrEqual(before + 30 * 60);
    expect(params.expires_at).toBeLessThanOrEqual(after + 30 * 60);
  });
});
