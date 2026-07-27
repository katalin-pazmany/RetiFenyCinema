import { pgTable, pgEnum, serial, integer, text, numeric, boolean, timestamp, unique } from 'drizzle-orm/pg-core';

export const movies = pgTable('movies', {
  id: serial('id').primaryKey(),
  tmdbId: integer('tmdb_id').notNull().unique(),
  imdbId: text('imdb_id'),
  title: text('title').notNull(),
  synopsis: text('synopsis').notNull(),
  posterUrl: text('poster_url'),
  runtime: integer('runtime'),
  director: text('director'),
  actors: text('actors').array().notNull().default([]),
  imdbRating: numeric('imdb_rating', { precision: 3, scale: 1 }),
  trailerUrl: text('trailer_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const showtimes = pgTable('showtimes', {
  id: serial('id').primaryKey(),
  movieId: integer('movie_id')
    .notNull()
    .references(() => movies.id),
  startTime: timestamp('start_time').notNull(),
});

export const bookingStatus = pgEnum('booking_status', ['pending', 'confirmed', 'cancelled']);

export const seats = pgTable(
  'seats',
  {
    id: serial('id').primaryKey(),
    row: text('row').notNull(),
    seatNumber: integer('seat_number').notNull(),
    isAccessible: boolean('is_accessible').notNull().default(false),
  },
  (table) => [unique('seats_row_seat_number_unique').on(table.row, table.seatNumber)],
);

export const ticketTypes = pgTable('ticket_types', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  priceCents: integer('price_cents').notNull(),
});

export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  showtimeId: integer('showtime_id')
    .notNull()
    .references(() => showtimes.id),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  status: bookingStatus('status').notNull().default('pending'),
  heldUntil: timestamp('held_until'),
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  cancellationToken: text('cancellation_token').notNull().unique(),
  totalCents: integer('total_cents').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at'),
  cancelledAt: timestamp('cancelled_at'),
});

export const bookingSeats = pgTable('booking_seats', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .notNull()
    .references(() => bookings.id),
  seatId: integer('seat_id')
    .notNull()
    .references(() => seats.id),
  ticketTypeId: integer('ticket_type_id')
    .notNull()
    .references(() => ticketTypes.id),
  priceCents: integer('price_cents').notNull(),
});
