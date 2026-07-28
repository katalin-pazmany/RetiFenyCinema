import { eq } from 'drizzle-orm';
import { db as defaultDb } from './client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from './schema';
import type { Movie, Showtime, Seat, TicketType, Booking } from '../types';

type Database = typeof defaultDb;

function rowToMovie(row: typeof movies.$inferSelect): Movie {
  return {
    id: row.id,
    tmdbId: row.tmdbId,
    imdbId: row.imdbId,
    title: row.title,
    synopsis: row.synopsis,
    posterUrl: row.posterUrl,
    runtime: row.runtime,
    director: row.director,
    actors: row.actors,
    imdbRating: row.imdbRating !== null ? Number(row.imdbRating) : null,
    trailerUrl: row.trailerUrl,
  };
}

function rowToShowtime(row: typeof showtimes.$inferSelect): Showtime {
  return { id: row.id, movieId: row.movieId, startTime: row.startTime };
}

function rowToSeat(row: typeof seats.$inferSelect): Seat {
  return { id: row.id, row: row.row, seatNumber: row.seatNumber, isAccessible: row.isAccessible };
}

function rowToTicketType(row: typeof ticketTypes.$inferSelect): TicketType {
  return { id: row.id, code: row.code, label: row.label, priceCents: row.priceCents };
}

function rowToBooking(row: typeof bookings.$inferSelect): Booking {
  return {
    id: row.id,
    showtimeId: row.showtimeId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    status: row.status,
    heldUntil: row.heldUntil,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    cancellationToken: row.cancellationToken,
    totalCents: row.totalCents,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
    cancelledAt: row.cancelledAt,
  };
}

export async function getNowShowing(db: Database = defaultDb): Promise<Movie[]> {
  const rows = await db.select().from(movies).orderBy(movies.title);
  return rows.map(rowToMovie);
}

export async function getNowShowingWithShowtimes(db: Database = defaultDb): Promise<Array<Movie & { showtimes: Showtime[] }>> {
  const movieRows = await db.select().from(movies).orderBy(movies.title);
  const showtimeRows = await db.select().from(showtimes).orderBy(showtimes.startTime);

  const showtimesByMovieId = new Map<number, Showtime[]>();
  for (const row of showtimeRows) {
    const showtime = rowToShowtime(row);
    const existing = showtimesByMovieId.get(showtime.movieId) ?? [];
    existing.push(showtime);
    showtimesByMovieId.set(showtime.movieId, existing);
  }

  return movieRows.map((row) => ({
    ...rowToMovie(row),
    showtimes: showtimesByMovieId.get(row.id) ?? [],
  }));
}

export async function getMovieById(id: number, db: Database = defaultDb): Promise<Movie | null> {
  const rows = await db.select().from(movies).where(eq(movies.id, id)).limit(1);
  return rows[0] ? rowToMovie(rows[0]) : null;
}

export async function getShowtimesForMovie(movieId: number, db: Database = defaultDb): Promise<Showtime[]> {
  const rows = await db
    .select()
    .from(showtimes)
    .where(eq(showtimes.movieId, movieId))
    .orderBy(showtimes.startTime);
  return rows.map(rowToShowtime);
}

export async function getAllShowtimes(db: Database = defaultDb): Promise<Array<Showtime & { movie: Movie }>> {
  const rows = await db
    .select()
    .from(showtimes)
    .innerJoin(movies, eq(showtimes.movieId, movies.id))
    .orderBy(showtimes.startTime);

  return rows.map((row) => ({
    ...rowToShowtime(row.showtimes),
    movie: rowToMovie(row.movies),
  }));
}

export async function getSeats(db: Database = defaultDb): Promise<Seat[]> {
  const rows = await db.select().from(seats).orderBy(seats.row, seats.seatNumber);
  return rows.map(rowToSeat);
}

export async function getTicketTypes(db: Database = defaultDb): Promise<TicketType[]> {
  const rows = await db.select().from(ticketTypes).orderBy(ticketTypes.priceCents);
  return rows.map(rowToTicketType);
}

export async function getShowtimeById(id: number, db: Database = defaultDb): Promise<Showtime | null> {
  const rows = await db.select().from(showtimes).where(eq(showtimes.id, id)).limit(1);
  return rows[0] ? rowToShowtime(rows[0]) : null;
}

export async function getBookingById(id: number, db: Database = defaultDb): Promise<Booking | null> {
  const rows = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return rows[0] ? rowToBooking(rows[0]) : null;
}

export async function getBookingByCancellationToken(token: string, db: Database = defaultDb): Promise<Booking | null> {
  const rows = await db.select().from(bookings).where(eq(bookings.cancellationToken, token)).limit(1);
  return rows[0] ? rowToBooking(rows[0]) : null;
}

export async function getBookingSeatsWithDetails(
  bookingId: number,
  db: Database = defaultDb,
): Promise<Array<{ seat: Seat; ticketType: TicketType; priceCents: number }>> {
  const rows = await db
    .select()
    .from(bookingSeats)
    .innerJoin(seats, eq(bookingSeats.seatId, seats.id))
    .innerJoin(ticketTypes, eq(bookingSeats.ticketTypeId, ticketTypes.id))
    .where(eq(bookingSeats.bookingId, bookingId));

  return rows.map((row) => ({
    seat: { id: row.seats.id, row: row.seats.row, seatNumber: row.seats.seatNumber, isAccessible: row.seats.isAccessible },
    ticketType: { id: row.ticket_types.id, code: row.ticket_types.code, label: row.ticket_types.label, priceCents: row.ticket_types.priceCents },
    priceCents: row.booking_seats.priceCents,
  }));
}
