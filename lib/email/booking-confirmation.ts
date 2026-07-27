import { resend } from './resend-client';
import { formatShowtime } from '../format';
import type { Booking, Movie, Showtime, Seat, TicketType } from '../types';

export async function sendBookingConfirmationEmail(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: Array<{ seat: Seat; ticketType: TicketType; priceCents: number }>,
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const seatList = seatDetails.map(({ seat, ticketType }) => `${seat.row}${seat.seatNumber} (${ticketType.label})`).join(', ');
  const cancelUrl = `${siteUrl}/booking/cancel/${booking.cancellationToken}`;

  const result = await resend.emails.send({
    from: 'RetfenyMozi <bookings@retfenymozi.example>',
    to: booking.customerEmail,
    subject: `Your booking for ${movie.title} is confirmed`,
    html: `
      <h1>You're all set, ${booking.customerName}!</h1>
      <p><strong>${movie.title}</strong> — ${formatShowtime(showtime.startTime)}</p>
      <p>Seats: ${seatList}</p>
      <p>Total paid: $${(booking.totalCents / 100).toFixed(2)}</p>
      <p>Need to cancel? <a href="${cancelUrl}">Cancel this booking</a></p>
    `,
  });

  if (result.error) {
    throw new Error(`Resend API error: ${result.error.message}`);
  }
}
