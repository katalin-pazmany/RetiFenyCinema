import { pgTable, serial, integer, text, numeric, timestamp } from 'drizzle-orm/pg-core';

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
