import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from '../../lib/db/schema';
import { getSeatAvailability } from '../../lib/booking/availability';

const db = createDb(process.env.TEST_DATABASE_URL!);

const movieFixture = {
  tmdbId: 900001,
  imdbId: 'tt9000001',
  title: 'Availability Test Movie',
  synopsis: 'Fixture.',
  posterUrl: null,
  runtime: 100,
  director: null,
  actors: [],
  imdbRating: null,
  trailerUrl: null,
};

describe('getSeatAvailability', () => {
  beforeEach(async () => {
    await db.delete(bookingSeats);
    await db.delete(bookings);
    await db.delete(showtimes);
    await db.delete(movies);
    await db.delete(seats);
    await db.delete(ticketTypes);

    await db.insert(seats).values([
      { row: 'A', seatNumber: 1, isAccessible: false },
      { row: 'A', seatNumber: 2, isAccessible: false },
    ]);
    await db.insert(ticketTypes).values({ code: 'adult', label: 'Adult', priceCents: 1200 });
  });

  // The last test in this file leaves rows behind (beforeEach only cleans up
  // *before* the next test runs). Other integration test files' beforeEach
  // hooks delete `movies`/`showtimes` without knowing about `bookings`, so a
  // dangling booking here would break their FK constraints when the whole
  // suite runs in one process. Clean up after the last test too.
  afterAll(async () => {
    await db.delete(bookingSeats);
    await db.delete(bookings);
    await db.delete(showtimes);
    await db.delete(movies);
  });

  it('marks every seat available when nothing is booked', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();

    const availability = await getSeatAvailability(showtime.id, db);

    expect(availability).toHaveLength(2);
    expect(availability.every((seat) => seat.available)).toBe(true);
  });

  it('marks a seat unavailable when confirmed for that showtime', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();
    const [ticketType] = await db.select().from(ticketTypes).limit(1);
    const [seatA1] = await db.select().from(seats).where(eq(seats.row, 'A')).limit(1);

    const [booking] = await db
      .insert(bookings)
      .values({
        showtimeId: showtime.id,
        customerName: 'Test',
        customerEmail: 'test@example.com',
        status: 'confirmed',
        cancellationToken: 'test-token-1',
        totalCents: 1200,
      })
      .returning();
    await db.insert(bookingSeats).values({ bookingId: booking.id, seatId: seatA1.id, ticketTypeId: ticketType.id, priceCents: 1200 });

    const availability = await getSeatAvailability(showtime.id, db);
    const seatA1Availability = availability.find((s) => s.id === seatA1.id);

    expect(seatA1Availability?.available).toBe(false);
    expect(availability.filter((s) => s.available)).toHaveLength(1);
  });

  it('marks a seat available again once its pending hold has expired', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();
    const [ticketType] = await db.select().from(ticketTypes).limit(1);
    const [seatA1] = await db.select().from(seats).where(eq(seats.row, 'A')).limit(1);

    const [booking] = await db
      .insert(bookings)
      .values({
        showtimeId: showtime.id,
        customerName: 'Test',
        customerEmail: 'test@example.com',
        status: 'pending',
        heldUntil: new Date(Date.now() - 1000), // already expired
        cancellationToken: 'test-token-2',
        totalCents: 1200,
      })
      .returning();
    await db.insert(bookingSeats).values({ bookingId: booking.id, seatId: seatA1.id, ticketTypeId: ticketType.id, priceCents: 1200 });

    const availability = await getSeatAvailability(showtime.id, db);
    const seatA1Availability = availability.find((s) => s.id === seatA1.id);

    expect(seatA1Availability?.available).toBe(true);
  });
});
