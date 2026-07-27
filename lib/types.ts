export interface MovieMetadata {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  synopsis: string;
  posterUrl: string | null;
  runtime: number | null;
  director: string | null;
  actors: string[];
  trailerUrl: string | null;
}

export interface Movie extends MovieMetadata {
  id: number;
  imdbRating: number | null;
}

export interface Showtime {
  id: number;
  movieId: number;
  startTime: Date;
}

export interface Seat {
  id: number;
  row: string;
  seatNumber: number;
  isAccessible: boolean;
}

export interface TicketType {
  id: number;
  code: string;
  label: string;
  priceCents: number;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export interface Booking {
  id: number;
  showtimeId: number;
  customerName: string;
  customerEmail: string;
  status: BookingStatus;
  heldUntil: Date | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  cancellationToken: string;
  totalCents: number;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}

export interface BookingSeat {
  id: number;
  bookingId: number;
  seatId: number;
  ticketTypeId: number;
  priceCents: number;
}

export interface SeatAvailability extends Seat {
  available: boolean;
}

export interface SeatSelection {
  seatId: number;
  ticketTypeId: number;
}
