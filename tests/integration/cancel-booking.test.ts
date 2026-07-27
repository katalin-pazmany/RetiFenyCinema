import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from '../../lib/db/schema';
import { cancelBooking } from '../../lib/booking/cancel-booking';

vi.mock('../../lib/stripe/client', () => ({
  stripe: {
    refunds: {
      create: vi.fn().mockResolvedValue({ id: 're_test_123' }),
    },
  },
}));

const db = createDb(process.env.TEST_DATABASE_URL!);

async function seedConfirmedBooking(showtimeStart: Date) {
  await db.delete(bookingSeats);
  await db.delete(bookings);
  await db.delete(showtimes);
  await db.delete(movies);
  await db.delete(seats);
  await db.delete(ticketTypes);

  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 900004,
      imdbId: 'tt9000004',
      title: 'Cancel Booking Test Movie',
      synopsis: 'Fixture.',
      posterUrl: null,
      runtime: 100,
      director: null,
      actors: [],
      imdbRating: null,
      trailerUrl: null,
    })
    .returning();
  const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: showtimeStart }).returning();
  const [ticketType] = await db.insert(ticketTypes).values({ code: 'adult', label: 'Adult', priceCents: 1200 }).returning();
  const [seat] = await db.insert(seats).values({ row: 'A', seatNumber: 1, isAccessible: false }).returning();

  const [booking] = await db
    .insert(bookings)
    .values({
      showtimeId: showtime.id,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      status: 'confirmed',
      stripePaymentIntentId: 'pi_test_cancel',
      cancellationToken: 'cancel-test-token',
      totalCents: 1200,
      confirmedAt: new Date(),
    })
    .returning();
  await db.insert(bookingSeats).values({ bookingId: booking.id, seatId: seat.id, ticketTypeId: ticketType.id, priceCents: 1200 });

  return booking;
}

describe('cancelBooking', () => {
  it('refunds and cancels a confirmed booking for a future showtime', async () => {
    await seedConfirmedBooking(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const result = await cancelBooking('cancel-test-token', db);

    expect(result).toEqual({ ok: true });

    const [updated] = await db.select().from(bookings).where(eq(bookings.status, 'cancelled'));
    expect(updated.cancelledAt).not.toBeNull();
  });

  it('rejects cancelling a booking whose showtime has already passed', async () => {
    await seedConfirmedBooking(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const result = await cancelBooking('cancel-test-token', db);

    expect(result).toEqual({ ok: false, reason: 'This showtime has already passed.' });
  });

  it('returns an already-cancelled result for a token used twice', async () => {
    await seedConfirmedBooking(new Date(Date.now() + 24 * 60 * 60 * 1000));

    await cancelBooking('cancel-test-token', db);
    const secondResult = await cancelBooking('cancel-test-token', db);

    expect(secondResult).toEqual({ ok: false, reason: 'This booking has already been cancelled.' });
  });

  it('returns ok:false for an unknown token', async () => {
    const result = await cancelBooking('does-not-exist', db);
    expect(result).toEqual({ ok: false, reason: 'No booking found for this link.' });
  });
});
