import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDb } from '../../lib/db/client';
import { movies, showtimes } from '../../lib/db/schema';
import { seedMovie } from '../../scripts/seed-movie';

vi.mock('../../lib/external/tmdb', () => ({
  fetchTmdbMovie: vi.fn().mockResolvedValue({
    tmdbId: 27205,
    imdbId: 'tt1375666',
    title: 'Inception',
    synopsis: 'A thief who steals corporate secrets.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    runtime: 148,
    director: 'Christopher Nolan',
    actors: ['Leonardo DiCaprio', 'Tom Hardy'],
    trailerUrl: 'https://www.youtube.com/watch?v=trailer-key',
  }),
}));

vi.mock('../../lib/external/omdb', () => ({
  fetchImdbRating: vi.fn().mockResolvedValue(8.8),
}));

const db = createDb(process.env.TEST_DATABASE_URL!);

describe('seedMovie', () => {
  beforeEach(async () => {
    await db.delete(showtimes);
    await db.delete(movies);
  });

  it('inserts a movie with its metadata and showtimes', async () => {
    await seedMovie(27205, ['2026-08-01T18:00:00Z'], db, 'tmdb-key', 'omdb-key');

    const rows = await db.select().from(movies);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tmdbId: 27205,
      imdbId: 'tt1375666',
      title: 'Inception',
      director: 'Christopher Nolan',
      actors: ['Leonardo DiCaprio', 'Tom Hardy'],
      imdbRating: '8.8',
    });

    const showtimeRows = await db.select().from(showtimes);
    expect(showtimeRows).toHaveLength(1);
    expect(showtimeRows[0].movieId).toBe(rows[0].id);
  });

  it('updates the existing row when the same tmdbId is seeded again', async () => {
    await seedMovie(27205, [], db, 'tmdb-key', 'omdb-key');
    await seedMovie(27205, [], db, 'tmdb-key', 'omdb-key');

    const rows = await db.select().from(movies);
    expect(rows).toHaveLength(1);
  });
});
