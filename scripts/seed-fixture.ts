import { db as defaultDb } from '../lib/db/client';
import { movies, showtimes, bookings, bookingSeats } from '../lib/db/schema';

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
  await db.delete(bookingSeats);
  await db.delete(bookings);
  await db.delete(showtimes);
  await db.delete(movies);
  const [movie] = await db.insert(movies).values(FIXTURE_MOVIE).returning();
  await db.insert(showtimes).values({ movieId: movie.id, startTime: FIXTURE_SHOWTIME_START });
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
