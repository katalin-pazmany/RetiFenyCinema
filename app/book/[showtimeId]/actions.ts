'use server';

import { redirect } from 'next/navigation';
import { createPendingBooking, SeatUnavailableError } from '@/lib/booking/create-booking';
import { startCheckoutForBooking } from '@/lib/booking/create-checkout-session';
import { getMovieById, getShowtimeById, getBookingSeatsWithDetails, getBookingById } from '@/lib/db/queries';
import type { SeatSelection } from '@/lib/types';

function isValidSelections(value: unknown): value is SeatSelection[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { seatId: unknown }).seatId === 'number' &&
        typeof (item as { ticketTypeId: unknown }).ticketTypeId === 'number',
    )
  );
}

export async function createBookingAction(showtimeId: number, formData: FormData): Promise<{ error: string } | undefined> {
  const customerName = String(formData.get('customerName') ?? '').trim();
  const customerEmail = String(formData.get('customerEmail') ?? '').trim();

  let parsedSelections: unknown;
  try {
    parsedSelections = JSON.parse(String(formData.get('selections') ?? '[]'));
  } catch {
    return { error: 'Invalid booking submission.' };
  }

  if (!isValidSelections(parsedSelections)) {
    return { error: 'Invalid booking submission.' };
  }
  const selections = parsedSelections;

  if (!customerName || !customerEmail || selections.length === 0) {
    return { error: 'Missing required booking details.' };
  }

  const showtime = await getShowtimeById(showtimeId);
  if (!showtime) {
    return { error: 'This showtime no longer exists.' };
  }

  const movie = await getMovieById(showtime.movieId);
  if (!movie) {
    return { error: 'This movie no longer exists.' };
  }

  let bookingId: number;
  try {
    const booking = await createPendingBooking(showtimeId, selections, customerName, customerEmail);
    bookingId = booking.id;
  } catch (err) {
    if (err instanceof SeatUnavailableError) {
      return { error: 'One or more of your selected seats was just taken. Please choose again.' };
    }
    throw err;
  }

  const seatDetails = await getBookingSeatsWithDetails(bookingId);
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { error: 'Something went wrong creating your booking. Please try again.' };
  }

  // `startCheckoutForBooking` releases this booking's seat hold if Stripe fails,
  // so a failed checkout never leaves seats locked up for a purchase that can
  // no longer be completed.
  const checkout = await startCheckoutForBooking(booking, movie, showtime, seatDetails);
  if (!checkout.ok) {
    return { error: 'Something went wrong starting checkout. Please try again.' };
  }

  redirect(checkout.url);
}
