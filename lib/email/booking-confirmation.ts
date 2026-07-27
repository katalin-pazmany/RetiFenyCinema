import { resend } from './resend-client';
import { formatShowtime } from '../format';
import { resolveSiteUrl } from '../site-url';
import type { Booking, Movie, Showtime, Seat, TicketType } from '../types';

// `.example` is an IANA-reserved TLD that can never be verified with Resend, so
// every real send from it is rejected. It survives only as a local/test
// placeholder; deployed environments must set BOOKING_FROM_EMAIL to an address
// on a domain verified with Resend, or customers get no confirmation and no
// cancellation link at all.
const FALLBACK_FROM_ADDRESS = 'RetfenyMozi <bookings@retfenymozi.example>';

export async function sendBookingConfirmationEmail(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: Array<{ seat: Seat; ticketType: TicketType; priceCents: number }>,
): Promise<void> {
  const siteUrl = resolveSiteUrl();
  const seatList = seatDetails.map(({ seat, ticketType }) => `${seat.row}${seat.seatNumber} (${ticketType.label})`).join(', ');
  const cancelUrl = `${siteUrl}/booking/cancel/${booking.cancellationToken}`;

  const result = await resend.emails.send({
    from: process.env.BOOKING_FROM_EMAIL || FALLBACK_FROM_ADDRESS,
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
