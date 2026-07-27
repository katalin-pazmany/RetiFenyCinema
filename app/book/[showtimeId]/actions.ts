'use server';

import { redirect } from 'next/navigation';
import { createPendingBooking, SeatUnavailableError } from '@/lib/booking/create-booking';
import { createCheckoutSessionForBooking } from '@/lib/booking/create-checkout-session';
import { getMovieById, getShowtimeById, getBookingSeatsWithDetails, getBookingById } from '@/lib/db/queries';
import type { SeatSelection } from '@/lib/types';

export async function createBookingAction(showtimeId: number, formData: FormData): Promise<{ error: string } | undefined> {
  const customerName = String(formData.get('customerName') ?? '').trim();
  const customerEmail = String(formData.get('customerEmail') ?? '').trim();
  const selections = JSON.parse(String(formData.get('selections') ?? '[]')) as SeatSelection[];

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

  const checkoutUrl = await createCheckoutSessionForBooking(booking, movie, showtime, seatDetails);

  redirect(checkoutUrl);
}
