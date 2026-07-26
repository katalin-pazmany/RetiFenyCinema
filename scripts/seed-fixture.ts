import { db as defaultDb } from '../lib/db/client';
import { movies, showtimes } from '../lib/db/schema';

type Database = typeof defaultDb;

export const FIXTURE_MOVIE = {
  tmdbId: 999999,
  imdbId: 'tt9999999',
  title: 'The Operational Engineer',
  synopsis: 'A test movie seeded for end-to-end tests.',
  posterUrl: 'https://example.com/poster.jpg',
  runtime: 120,
  director: 'Ada Lovelace',
  actors: ['Grace Hopper', 'Alan Turing'],
  imdbRating: '8.5',
  trailerUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

export const FIXTURE_SHOWTIME_START = new Date('2026-08-01T18:00:00Z');

export async function seedFixture(db: Database = defaultDb): Promise<void> {
  // Check if fixture movie already exists
  const existingMovie = await db.query.movies.findFirst({
    where: (movies, { eq }) => eq(movies.tmdbId, FIXTURE_MOVIE.tmdbId),
  });

  let movie = existingMovie;

  // Only insert if movie doesn't exist
  if (!existingMovie) {
    await db.delete(showtimes);
    await db.delete(movies);
    [movie] = await db.insert(movies).values(FIXTURE_MOVIE).returning();
  }

  // Check if showtime already exists before inserting
  const existingShowtime = await db.query.showtimes.findFirst({
    where: (showtimes, { and, eq }) =>
      and(
        eq(showtimes.movieId, movie!.id),
        eq(showtimes.startTime, FIXTURE_SHOWTIME_START),
      ),
  });

  if (!existingShowtime) {
    await db.insert(showtimes).values({ movieId: movie!.id, startTime: FIXTURE_SHOWTIME_START });
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  seedFixture()
    .then(() => {
      console.log('Fixture seeded');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
