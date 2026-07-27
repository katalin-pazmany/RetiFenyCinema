import { and, eq, inArray, ne } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { seats, bookings, bookingSeats } from '../db/schema';
import { getMovieById, getShowtimeById, getBookingSeatsWithDetails } from '../db/queries';
import { sendBookingConfirmationEmail } from '../email/booking-confirmation';
import { isActiveClaimCondition } from './availability';
import type { Booking } from '../types';

type Database = typeof defaultDb;

type ConfirmOutcome = { ok: true; booking: Booking; newlyConfirmed: boolean } | { ok: false; reason: string };

export async function confirmBooking(
  checkoutSessionId: string,
  paymentIntentId: string,
  db: Database = defaultDb,
): Promise<{ ok: true; bookingId: number } | { ok: false; reason: string }> {
  // The lookup, the seat lock, the conflict re-check and the confirming write
  // all run in one transaction. Without it, a concurrent `createPendingBooking`
  // for the same seats could slip between our conflict check and our update and
  // both would succeed. `createPendingBooking` takes the same `SELECT ... FOR
  // UPDATE` on the same `seats` rows, so whichever transaction gets there first
  // makes the other block and then re-read accurate state.
  const outcome: ConfirmOutcome = await db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.stripeCheckoutSessionId, checkoutSessionId)).limit(1);

    if (!booking) {
      return { ok: false, reason: 'No booking found for this checkout session' };
    }

    if (booking.status === 'confirmed') {
      // Already confirmed — safe to treat webhook retries as a no-op success.
      return { ok: true, booking, newlyConfirmed: false };
    }

    const thisBookingSeats = await tx.select({ seatId: bookingSeats.seatId }).from(bookingSeats).where(eq(bookingSeats.bookingId, booking.id));
    const seatIds = thisBookingSeats.map((row) => row.seatId);

    // The same lock `createPendingBooking` takes, on the same rows, so the two
    // paths serialize against each other instead of racing.
    await tx.select().from(seats).where(inArray(seats.id, seatIds)).for('update');

    // Re-validate that no other booking has since confirmed or is actively
    // holding any of these same seats for the same showtime — the rare race
    // where this booking's 10-minute hold expired before payment completed but
    // Stripe's own session had not yet expired. An *expired* pending hold on
    // the same seat is not a claim (see `isActiveClaimCondition`), so it must
    // not block this confirmation.
    const conflictingRows = await tx
      .select({ bookingId: bookingSeats.bookingId })
      .from(bookingSeats)
      .innerJoin(bookings, eq(bookingSeats.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.showtimeId, booking.showtimeId),
          inArray(bookingSeats.seatId, seatIds),
          ne(bookings.id, booking.id),
          isActiveClaimCondition(),
        ),
      );

    if (conflictingRows.length > 0) {
      // Left `pending` rather than confirmed or deleted, for manual follow-up —
      // the customer paid but their seat was reclaimed in the gap between hold
      // expiry and payment completion. Not expected to occur in practice.
      return { ok: false, reason: 'Seat conflict detected at confirmation time' };
    }

    const confirmedAt = new Date();
    await tx
      .update(bookings)
      .set({ status: 'confirmed', stripePaymentIntentId: paymentIntentId, confirmedAt, heldUntil: null })
      .where(eq(bookings.id, booking.id));

    return {
      ok: true,
      booking: { ...booking, status: 'confirmed', stripePaymentIntentId: paymentIntentId, confirmedAt, heldUntil: null },
      newlyConfirmed: true,
    };
  });

  if (!outcome.ok) {
    return { ok: false, reason: outcome.reason };
  }

  if (!outcome.newlyConfirmed) {
    return { ok: true, bookingId: outcome.booking.id };
  }

  // Sending the email is a side effect, not part of the atomic seat claim, so
  // it stays outside the transaction — holding a row lock open across a network
  // call to Resend would serialize unrelated bookings behind an external API.
  const { booking } = outcome;
  const showtime = await getShowtimeById(booking.showtimeId, db);
  const movie = showtime ? await getMovieById(showtime.movieId, db) : null;
  const seatDetails = await getBookingSeatsWithDetails(booking.id, db);

  if (showtime && movie) {
    try {
      await sendBookingConfirmationEmail(booking, movie, showtime, seatDetails);
    } catch (err) {
      console.error('Failed to send booking confirmation email:', err);
    }
  }

  return { ok: true, bookingId: booking.id };
}
