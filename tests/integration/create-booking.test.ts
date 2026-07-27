import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from '../../lib/db/schema';
import { createPendingBooking, SeatUnavailableError } from '../../lib/booking/create-booking';

const db = createDb(process.env.TEST_DATABASE_URL!);

const movieFixture = {
  tmdbId: 900002,
  imdbId: 'tt9000002',
  title: 'Create Booking Test Movie',
  synopsis: 'Fixture.',
  posterUrl: null,
  runtime: 100,
  director: null,
  actors: [],
  imdbRating: null,
  trailerUrl: null,
};

async function seedShowtimeWithSeats() {
  await db.delete(bookingSeats);
  await db.delete(bookings);
  await db.delete(showtimes);
  await db.delete(movies);
  await db.delete(seats);
  await db.delete(ticketTypes);

  const [movie] = await db.insert(movies).values(movieFixture).returning();
  const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();
  const [ticketType] = await db.insert(ticketTypes).values({ code: 'adult', label: 'Adult', priceCents: 1200 }).returning();
  const seedSeats = await db
    .insert(seats)
    .values([
      { row: 'A', seatNumber: 1, isAccessible: false },
      { row: 'A', seatNumber: 2, isAccessible: false },
    ])
    .returning();

  return { showtime, ticketType, seedSeats };
}

describe('createPendingBooking', () => {
  beforeEach(seedShowtimeWithSeats);

  it('creates a pending booking with its seats and a 10-minute hold', async () => {
    const { showtime, ticketType, seedSeats } = await seedShowtimeWithSeats();

    const booking = await createPendingBooking(
      showtime.id,
      [{ seatId: seedSeats[0].id, ticketTypeId: ticketType.id }],
      'Jane Doe',
      'jane@example.com',
      db,
    );

    expect(booking.status).toBe('pending');
    expect(booking.totalCents).toBe(1200);
    expect(booking.heldUntil).not.toBeNull();
    expect(booking.heldUntil!.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    expect(booking.heldUntil!.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);

    const seatRows = await db.select().from(bookingSeats).where(eq(bookingSeats.bookingId, booking.id));
    expect(seatRows).toHaveLength(1);
    expect(seatRows[0].priceCents).toBe(1200);
  });

  it('rejects a seat that is already confirmed for that showtime', async () => {
    const { showtime, ticketType, seedSeats } = await seedShowtimeWithSeats();

    const [existingBooking] = await db
      .insert(bookings)
      .values({
        showtimeId: showtime.id,
        customerName: 'Existing',
        customerEmail: 'existing@example.com',
        status: 'confirmed',
        cancellationToken: 'existing-token',
        totalCents: 1200,
      })
      .returning();
    await db.insert(bookingSeats).values({ bookingId: existingBooking.id, seatId: seedSeats[0].id, ticketTypeId: ticketType.id, priceCents: 1200 });

    await expect(
      createPendingBooking(showtime.id, [{ seatId: seedSeats[0].id, ticketTypeId: ticketType.id }], 'Jane Doe', 'jane@example.com', db),
    ).rejects.toThrow(SeatUnavailableError);

    const allBookings = await db.select().from(bookings);
    expect(allBookings).toHaveLength(1); // the rejected attempt created no row
  });

  it('rejects one concurrent claim on the same seat and lets the other through', async () => {
    const { showtime, ticketType, seedSeats } = await seedShowtimeWithSeats();

    const results = await Promise.allSettled([
      createPendingBooking(showtime.id, [{ seatId: seedSeats[0].id, ticketTypeId: ticketType.id }], 'Customer A', 'a@example.com', db),
      createPendingBooking(showtime.id, [{ seatId: seedSeats[0].id, ticketTypeId: ticketType.id }], 'Customer B', 'b@example.com', db),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SeatUnavailableError);

    const allBookings = await db.select().from(bookings);
    expect(allBookings).toHaveLength(1); // only the winner's booking exists
  });
});
