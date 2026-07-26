import { eq } from 'drizzle-orm';
import { db as defaultDb } from './client';
import { movies, showtimes } from './schema';
import type { Movie, Showtime } from '../types';

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

export async function getNowShowing(db: Database = defaultDb): Promise<Movie[]> {
  const rows = await db.select().from(movies).orderBy(movies.title);
  return rows.map(rowToMovie);
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
