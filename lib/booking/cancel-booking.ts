import { eq } from 'drizzle-orm';
import { stripe } from '../stripe/client';
import { db as defaultDb } from '../db/client';
import { bookings, showtimes } from '../db/schema';

type Database = typeof defaultDb;

export async function cancelBooking(
  cancellationToken: string,
  db: Database = defaultDb,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.cancellationToken, cancellationToken)).limit(1);

  if (!booking) {
    return { ok: false, reason: 'No booking found for this link.' };
  }

  if (booking.status === 'cancelled') {
    return { ok: false, reason: 'This booking has already been cancelled.' };
  }

  const [showtime] = await db.select().from(showtimes).where(eq(showtimes.id, booking.showtimeId)).limit(1);
  if (showtime && showtime.startTime.getTime() < Date.now()) {
    return { ok: false, reason: 'This showtime has already passed.' };
  }

  if (booking.stripePaymentIntentId) {
    try {
      await stripe.refunds.create({ payment_intent: booking.stripePaymentIntentId });
    } catch (err) {
      return { ok: false, reason: `Refund failed: ${(err as Error).message}. Please contact support.` };
    }
  }

  await db.update(bookings).set({ status: 'cancelled', cancelledAt: new Date() }).where(eq(bookings.id, booking.id));

  return { ok: true };
}
