import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from '../../lib/db/schema';
import { createPendingBooking } from '../../lib/booking/create-booking';
import { startCheckoutForBooking } from '../../lib/booking/create-checkout-session';
import { getSeatAvailability } from '../../lib/booking/availability';
import { getBookingSeatsWithDetails, getMovieById, getShowtimeById } from '../../lib/db/queries';

const createSession = vi.fn();

vi.mock('../../lib/stripe/client', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: (...args: unknown[]) => createSession(...args),
      },
    },
  },
}));

const db = createDb(process.env.TEST_DATABASE_URL!);

async function seedShowtimeWithSeats() {
  await db.delete(bookingSeats);
  await db.delete(bookings);
  await db.delete(showtimes);
  await db.delete(movies);
  await db.delete(seats);
  await db.delete(ticketTypes);

  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 900005,
      imdbId: 'tt9000005',
      title: 'Start Checkout Test Movie',
      synopsis: 'Fixture.',
      posterUrl: null,
      runtime: 100,
      director: null,
      actors: [],
      imdbRating: null,
      trailerUrl: null,
    })
    .returning();
  const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();
  const [ticketType] = await db.insert(ticketTypes).values({ code: 'adult', label: 'Adult', priceCents: 1200 }).returning();
  const [seat] = await db.insert(seats).values({ row: 'A', seatNumber: 1, isAccessible: false }).returning();

  return { movie, showtime, ticketType, seat };
}

describe('startCheckoutForBooking', () => {
  beforeEach(() => {
    createSession.mockReset();
  });

  it('releases the seat hold when Stripe fails, instead of stranding the seats for the full hold window', async () => {
    const { showtime, ticketType, seat } = await seedShowtimeWithSeats();

    const pending = await createPendingBooking(showtime.id, [{ seatId: seat.id, ticketTypeId: ticketType.id }], 'Jane Doe', 'jane@example.com', db);

    // Sanity check: while the hold is live the seat is genuinely claimed.
    const heldAvailability = await getSeatAvailability(showtime.id, db);
    expect(heldAvailability.find((s) => s.id === seat.id)!.available).toBe(false);

    createSession.mockRejectedValue(new Error('Stripe is down'));

    const movieRow = await getMovieById(showtime.movieId, db);
    const showtimeRow = await getShowtimeById(showtime.id, db);
    const seatDetails = await getBookingSeatsWithDetails(pending.id, db);

    const result = await startCheckoutForBooking(pending, movieRow!, showtimeRow!, seatDetails, db);

    expect(result).toEqual({ ok: false });

    const availability = await getSeatAvailability(showtime.id, db);
    expect(availability.find((s) => s.id === seat.id)!.available).toBe(true);

    // The booking row survives for auditability; only its hold was expired.
    const [row] = await db.select().from(bookings).where(eq(bookings.id, pending.id));
    expect(row.status).toBe('pending');
    expect(row.heldUntil!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('returns the Checkout Session URL and keeps the hold when Stripe succeeds', async () => {
    const { showtime, ticketType, seat } = await seedShowtimeWithSeats();

    const pending = await createPendingBooking(showtime.id, [{ seatId: seat.id, ticketTypeId: ticketType.id }], 'Jane Doe', 'jane@example.com', db);

    createSession.mockResolvedValue({ id: 'cs_test_start', url: 'https://checkout.stripe.test/cs_test_start' });

    const movieRow = await getMovieById(showtime.movieId, db);
    const showtimeRow = await getShowtimeById(showtime.id, db);
    const seatDetails = await getBookingSeatsWithDetails(pending.id, db);

    const result = await startCheckoutForBooking(pending, movieRow!, showtimeRow!, seatDetails, db);

    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.test/cs_test_start' });

    const [row] = await db.select().from(bookings).where(eq(bookings.id, pending.id));
    expect(row.stripeCheckoutSessionId).toBe('cs_test_start');
    expect(row.heldUntil!.getTime()).toBeGreaterThan(Date.now());

    const availability = await getSeatAvailability(showtime.id, db);
    expect(availability.find((s) => s.id === seat.id)!.available).toBe(false);
  });

  it('refuses to charge a total that disagrees with the booking, and releases the hold', async () => {
    const { showtime, ticketType, seat } = await seedShowtimeWithSeats();

    const pending = await createPendingBooking(showtime.id, [{ seatId: seat.id, ticketTypeId: ticketType.id }], 'Jane Doe', 'jane@example.com', db);

    const movieRow = await getMovieById(showtime.movieId, db);
    const showtimeRow = await getShowtimeById(showtime.id, db);
    const seatDetails = await getBookingSeatsWithDetails(pending.id, db);

    // Simulate the two derivations drifting apart: the line items would total
    // 9900 while the booking says 1200. Stripe must never be called.
    const drifted = seatDetails.map((detail) => ({ ...detail, priceCents: 9900 }));

    const result = await startCheckoutForBooking(pending, movieRow!, showtimeRow!, drifted, db);

    expect(result).toEqual({ ok: false });
    expect(createSession).not.toHaveBeenCalled();

    const availability = await getSeatAvailability(showtime.id, db);
    expect(availability.find((s) => s.id === seat.id)!.available).toBe(true);
  });
});
