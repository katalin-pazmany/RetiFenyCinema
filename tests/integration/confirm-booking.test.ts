import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from '../../lib/db/schema';
import { confirmBooking } from '../../lib/booking/confirm-booking';

const db = createDb(process.env.TEST_DATABASE_URL!);

async function seedPendingBooking(overrides: { heldUntil?: Date } = {}) {
  await db.delete(bookingSeats);
  await db.delete(bookings);
  await db.delete(showtimes);
  await db.delete(movies);
  await db.delete(seats);
  await db.delete(ticketTypes);

  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 900003,
      imdbId: 'tt9000003',
      title: 'Confirm Booking Test Movie',
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

  const [booking] = await db
    .insert(bookings)
    .values({
      showtimeId: showtime.id,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      status: 'pending',
      heldUntil: overrides.heldUntil ?? new Date(Date.now() + 5 * 60 * 1000),
      stripeCheckoutSessionId: 'cs_test_123',
      cancellationToken: 'confirm-test-token',
      totalCents: 1200,
    })
    .returning();
  await db.insert(bookingSeats).values({ bookingId: booking.id, seatId: seat.id, ticketTypeId: ticketType.id, priceCents: 1200 });

  return booking;
}

describe('confirmBooking', () => {
  it('marks a pending booking confirmed and clears its hold', async () => {
    const booking = await seedPendingBooking();

    const result = await confirmBooking('cs_test_123', 'pi_test_123', db);

    expect(result).toEqual({ ok: true, bookingId: booking.id });

    const [updated] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(updated.status).toBe('confirmed');
    expect(updated.stripePaymentIntentId).toBe('pi_test_123');
    expect(updated.confirmedAt).not.toBeNull();
  });

  it('does not confirm a booking whose hold already expired and whose seat was reclaimed', async () => {
    const booking = await seedPendingBooking({ heldUntil: new Date(Date.now() - 1000) });

    // Simulate another booking having claimed the same seat after this one's
    // hold expired — the edge case documented in the design spec.
    const [seatRow] = await db.select().from(seats).limit(1);
    const [showtimeRow] = await db.select().from(showtimes).limit(1);
    const [ticketTypeRow] = await db.select().from(ticketTypes).limit(1);
    const [otherBooking] = await db
      .insert(bookings)
      .values({
        showtimeId: showtimeRow.id,
        customerName: 'Someone Else',
        customerEmail: 'other@example.com',
        status: 'confirmed',
        cancellationToken: 'other-token',
        totalCents: 1200,
      })
      .returning();
    await db.insert(bookingSeats).values({ bookingId: otherBooking.id, seatId: seatRow.id, ticketTypeId: ticketTypeRow.id, priceCents: 1200 });

    const result = await confirmBooking('cs_test_123', 'pi_test_123', db);

    expect(result.ok).toBe(false);

    const [updated] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(updated.status).toBe('pending'); // left as-is for manual follow-up, not silently confirmed or deleted
  });

  it('confirms despite another booking holding the same seat on an already-expired pending hold', async () => {
    const booking = await seedPendingBooking({ heldUntil: new Date(Date.now() - 1000) });

    // Mirror of the test above, but the other booking is `pending` with a hold
    // that lapsed — an abandoned, never-paid booking. `getSeatAvailability` and
    // `createPendingBooking` both treat that seat as free, so confirmation must
    // too; otherwise a customer who genuinely paid is stranded in `pending`
    // forever with no email and no cancellation link.
    const [seatRow] = await db.select().from(seats).limit(1);
    const [showtimeRow] = await db.select().from(showtimes).limit(1);
    const [ticketTypeRow] = await db.select().from(ticketTypes).limit(1);
    const [abandonedBooking] = await db
      .insert(bookings)
      .values({
        showtimeId: showtimeRow.id,
        customerName: 'Abandoned Cart',
        customerEmail: 'abandoned@example.com',
        status: 'pending',
        heldUntil: new Date(Date.now() - 60 * 1000),
        cancellationToken: 'abandoned-token',
        totalCents: 1200,
      })
      .returning();
    await db
      .insert(bookingSeats)
      .values({ bookingId: abandonedBooking.id, seatId: seatRow.id, ticketTypeId: ticketTypeRow.id, priceCents: 1200 });

    const result = await confirmBooking('cs_test_123', 'pi_test_123', db);

    expect(result).toEqual({ ok: true, bookingId: booking.id });

    const [updated] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(updated.status).toBe('confirmed');
    expect(updated.heldUntil).toBeNull();
  });

  it('returns ok:false for an unknown checkout session id', async () => {
    const result = await confirmBooking('cs_test_does_not_exist', 'pi_test_123', db);
    expect(result).toEqual({ ok: false, reason: 'No booking found for this checkout session' });
  });
});
