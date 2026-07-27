import { and, eq, inArray, ne } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { bookings, bookingSeats } from '../db/schema';
import { getMovieById, getShowtimeById, getBookingSeatsWithDetails } from '../db/queries';
import { sendBookingConfirmationEmail } from '../email/booking-confirmation';

type Database = typeof defaultDb;

export async function confirmBooking(
  checkoutSessionId: string,
  paymentIntentId: string,
  db: Database = defaultDb,
): Promise<{ ok: true; bookingId: number } | { ok: false; reason: string }> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.stripeCheckoutSessionId, checkoutSessionId)).limit(1);

  if (!booking) {
    return { ok: false, reason: 'No booking found for this checkout session' };
  }

  if (booking.status === 'confirmed') {
    return { ok: true, bookingId: booking.id }; // already confirmed — safe to treat webhook retries as a no-op success
  }

  const thisBookingSeats = await db.select({ seatId: bookingSeats.seatId }).from(bookingSeats).where(eq(bookingSeats.bookingId, booking.id));
  const seatIds = thisBookingSeats.map((row) => row.seatId);

  // Re-validate that no other booking has since confirmed or is actively
  // holding any of these same seats for the same showtime — the rare race
  // where this booking's 10-minute hold expired before payment completed
  // but Stripe's own (minimum 30-minute) session had not yet expired.
  const conflictingRows = await db
    .select({ bookingId: bookingSeats.bookingId })
    .from(bookingSeats)
    .innerJoin(bookings, eq(bookingSeats.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.showtimeId, booking.showtimeId),
        inArray(bookingSeats.seatId, seatIds),
        ne(bookings.id, booking.id),
        ne(bookings.status, 'cancelled'),
      ),
    );

  if (conflictingRows.length > 0) {
    // Left `pending` rather than confirmed or deleted, for manual follow-up —
    // the customer paid but their seat was reclaimed in the gap between hold
    // expiry and payment completion. Not expected to occur in practice.
    return { ok: false, reason: 'Seat conflict detected at confirmation time' };
  }

  await db
    .update(bookings)
    .set({ status: 'confirmed', stripePaymentIntentId: paymentIntentId, confirmedAt: new Date(), heldUntil: null })
    .where(eq(bookings.id, booking.id));

  const showtime = await getShowtimeById(booking.showtimeId, db);
  const movie = showtime ? await getMovieById(showtime.movieId, db) : null;
  const seatDetails = await getBookingSeatsWithDetails(booking.id, db);

  if (showtime && movie) {
    try {
      await sendBookingConfirmationEmail(
        { ...booking, status: 'confirmed', stripePaymentIntentId: paymentIntentId, confirmedAt: new Date(), heldUntil: null },
        movie,
        showtime,
        seatDetails,
      );
    } catch (err) {
      console.error('Failed to send booking confirmation email:', err);
    }
  }

  return { ok: true, bookingId: booking.id };
}
