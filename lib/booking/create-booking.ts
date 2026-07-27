import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { seats, bookings, bookingSeats, ticketTypes } from '../db/schema';
import { isActiveClaimCondition } from './availability';
import { calculateTotalCents } from './pricing';
import type { SeatSelection, Booking } from '../types';

type Database = typeof defaultDb;

export class SeatUnavailableError extends Error {
  seatIds: number[];

  constructor(seatIds: number[]) {
    super(`Seat(s) no longer available: ${seatIds.join(', ')}`);
    this.name = 'SeatUnavailableError';
    this.seatIds = seatIds;
  }
}

const HOLD_DURATION_MS = 10 * 60 * 1000;

export async function createPendingBooking(
  showtimeId: number,
  selections: SeatSelection[],
  customerName: string,
  customerEmail: string,
  db: Database = defaultDb,
): Promise<Booking> {
  return db.transaction(async (tx) => {
    const seatIds = selections.map((s) => s.seatId);

    // Lock the requested seat rows for the life of this transaction so a
    // concurrent attempt on the same seat blocks until this one commits or
    // rolls back, then re-sees accurate availability. This locks the `seats`
    // table rows themselves (not a per-showtime lock), so a concurrent
    // booking attempt for a *different* showtime that happens to touch the
    // same physical seat numbers briefly serializes too — an acceptable cost
    // for a single-screen cinema's traffic, in exchange for a much simpler
    // locking scheme than per-(showtime,seat) advisory locks.
    await tx.select().from(seats).where(inArray(seats.id, seatIds)).for('update');

    const claimedRows = await tx
      .select({ seatId: bookingSeats.seatId })
      .from(bookingSeats)
      .innerJoin(bookings, eq(bookingSeats.bookingId, bookings.id))
      .where(and(eq(bookings.showtimeId, showtimeId), inArray(bookingSeats.seatId, seatIds), isActiveClaimCondition()));

    if (claimedRows.length > 0) {
      throw new SeatUnavailableError(claimedRows.map((r) => r.seatId));
    }

    const allTicketTypes = await tx.select().from(ticketTypes);
    const priceByTicketTypeId = new Map(allTicketTypes.map((t) => [t.id, t.priceCents]));
    const totalCents = calculateTotalCents(
      selections,
      allTicketTypes.map((t) => ({ id: t.id, code: t.code, label: t.label, priceCents: t.priceCents })),
    );

    const [bookingRow] = await tx
      .insert(bookings)
      .values({
        showtimeId,
        customerName,
        customerEmail,
        status: 'pending',
        heldUntil: new Date(Date.now() + HOLD_DURATION_MS),
        cancellationToken: randomUUID(),
        totalCents,
      })
      .returning();

    await tx.insert(bookingSeats).values(
      selections.map((selection) => ({
        bookingId: bookingRow.id,
        seatId: selection.seatId,
        ticketTypeId: selection.ticketTypeId,
        priceCents: priceByTicketTypeId.get(selection.ticketTypeId)!,
      })),
    );

    return {
      id: bookingRow.id,
      showtimeId: bookingRow.showtimeId,
      customerName: bookingRow.customerName,
      customerEmail: bookingRow.customerEmail,
      status: bookingRow.status,
      heldUntil: bookingRow.heldUntil,
      stripeCheckoutSessionId: bookingRow.stripeCheckoutSessionId,
      stripePaymentIntentId: bookingRow.stripePaymentIntentId,
      cancellationToken: bookingRow.cancellationToken,
      totalCents: bookingRow.totalCents,
      createdAt: bookingRow.createdAt,
      confirmedAt: bookingRow.confirmedAt,
      cancelledAt: bookingRow.cancelledAt,
    };
  });
}

/**
 * Expire a pending booking's hold immediately, so its seats become bookable
 * again on the very next availability read instead of staying locked up for
 * the remainder of the 10-minute window.
 *
 * Used when the flow that would have produced a payable Checkout Session for
 * this booking fails: without a Checkout Session the customer can never
 * complete it, so continuing to hold the seats only denies them to everyone.
 *
 * Setting `held_until` to now (rather than deleting the rows or marking the
 * booking cancelled) is deliberate: `isActiveClaimCondition` treats a pending
 * hold as active only while `held_until > now()`, and every such comparison
 * happens strictly after this write, so the seats read as free right away.
 * The abandoned row itself is kept for auditability, and it is indistinguishable
 * from a hold the customer simply let lapse — which is exactly what it is.
 */
export async function releaseBookingHold(bookingId: number, db: Database = defaultDb): Promise<void> {
  await db.update(bookings).set({ heldUntil: new Date() }).where(eq(bookings.id, bookingId));
}
