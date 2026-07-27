import { and, eq, gt, or } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { bookings, bookingSeats } from '../db/schema';
import { getSeats } from '../db/queries';
import type { SeatAvailability } from '../types';

type Database = typeof defaultDb;

export async function getSeatAvailability(showtimeId: number, db: Database = defaultDb): Promise<SeatAvailability[]> {
  const allSeats = await getSeats(db);

  const claimedRows = await db
    .select({ seatId: bookingSeats.seatId })
    .from(bookingSeats)
    .innerJoin(bookings, eq(bookingSeats.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.showtimeId, showtimeId),
        or(eq(bookings.status, 'confirmed'), and(eq(bookings.status, 'pending'), gt(bookings.heldUntil, new Date()))),
      ),
    );

  const claimedSeatIds = new Set(claimedRows.map((row) => row.seatId));

  return allSeats.map((seat) => ({ ...seat, available: !claimedSeatIds.has(seat.id) }));
}
