import { and, eq, gt, or, type SQL } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { bookings, bookingSeats } from '../db/schema';
import { getSeats } from '../db/queries';
import type { SeatAvailability } from '../types';

type Database = typeof defaultDb;

/**
 * The single definition of "this booking actively claims its seats": either it
 * is confirmed, or it is pending with an unexpired hold. An expired pending
 * hold (an abandoned booking that was never paid) claims nothing.
 *
 * This predicate has to agree in every place that reasons about seat claims —
 * availability lookups, new-booking conflict checks, and confirmation-time
 * re-validation — so it lives here once rather than being restated per call
 * site, where the three copies could (and did) drift apart.
 *
 * `now` is a parameter so callers inside one transaction can evaluate every
 * claim check against a single, consistent instant.
 */
export function isActiveClaimCondition(now: Date = new Date()): SQL {
  return or(eq(bookings.status, 'confirmed'), and(eq(bookings.status, 'pending'), gt(bookings.heldUntil, now)))!;
}

export async function getSeatAvailability(showtimeId: number, db: Database = defaultDb): Promise<SeatAvailability[]> {
  const allSeats = await getSeats(db);

  const claimedRows = await db
    .select({ seatId: bookingSeats.seatId })
    .from(bookingSeats)
    .innerJoin(bookings, eq(bookingSeats.bookingId, bookings.id))
    .where(and(eq(bookings.showtimeId, showtimeId), isActiveClaimCondition()));

  const claimedSeatIds = new Set(claimedRows.map((row) => row.seatId));

  return allSeats.map((seat) => ({ ...seat, available: !claimedSeatIds.has(seat.id) }));
}
