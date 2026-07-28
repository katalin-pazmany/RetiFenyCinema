import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, bookings, bookingSeats } from '../../lib/db/schema';
import { getNowShowing, getMovieById, getShowtimesForMovie, getAllShowtimes, getNowShowingWithShowtimes } from '../../lib/db/queries';

const db = createDb(process.env.TEST_DATABASE_URL!);

const movieFixture = {
  tmdbId: 27205,
  imdbId: 'tt1375666',
  title: 'Inception',
  synopsis: 'A thief who steals corporate secrets.',
  posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  runtime: 148,
  director: 'Christopher Nolan',
  actors: ['Leonardo DiCaprio', 'Tom Hardy'],
  imdbRating: '8.8',
  trailerUrl: 'https://www.youtube.com/watch?v=trailer-key',
};

describe('movie and showtime queries', () => {
  beforeEach(async () => {
    await db.delete(bookingSeats);
    await db.delete(bookings);
    await db.delete(showtimes);
    await db.delete(movies);
  });

  it('getNowShowing returns all movies', async () => {
    await db.insert(movies).values(movieFixture);

    const result = await getNowShowing(db);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: 'Inception', imdbRating: 8.8, actors: ['Leonardo DiCaprio', 'Tom Hardy'] });
  });

  it('getMovieById returns null for a missing id', async () => {
    expect(await getMovieById(999999, db)).toBeNull();
  });

  it('getShowtimesForMovie returns showtimes ordered by start time', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    await db.insert(showtimes).values([
      { movieId: movie.id, startTime: new Date('2026-08-02T18:00:00Z') },
      { movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') },
    ]);

    const result = await getShowtimesForMovie(movie.id, db);

    expect(result).toHaveLength(2);
    expect(result[0].startTime.toISOString()).toBe('2026-08-01T18:00:00.000Z');
  });

  it('getAllShowtimes joins the movie onto each showtime', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') });

    const result = await getAllShowtimes(db);

    expect(result).toHaveLength(1);
    expect(result[0].movie.title).toBe('Inception');
  });

  it('getNowShowingWithShowtimes returns movies ordered by title, each with its showtimes ordered by start time', async () => {
    const [movieB] = await db
      .insert(movies)
      .values({
        tmdbId: 900020,
        imdbId: 'tt9000020',
        title: 'B Movie',
        synopsis: 'Fixture.',
        posterUrl: null,
        runtime: 90,
        director: null,
        actors: [],
        imdbRating: null,
        trailerUrl: null,
      })
      .returning();
    const [movieA] = await db
      .insert(movies)
      .values({
        tmdbId: 900021,
        imdbId: 'tt9000021',
        title: 'A Movie',
        synopsis: 'Fixture.',
        posterUrl: null,
        runtime: 90,
        director: null,
        actors: [],
        imdbRating: null,
        trailerUrl: null,
      })
      .returning();

    const later = new Date('2026-08-01T20:00:00Z');
    const earlier = new Date('2026-08-01T18:00:00Z');
    await db.insert(showtimes).values([
      { movieId: movieA.id, startTime: later },
      { movieId: movieA.id, startTime: earlier },
    ]);

    const result = await getNowShowingWithShowtimes(db);

    expect(result.map((m) => m.title)).toEqual(['A Movie', 'B Movie']);
    expect(result[0].showtimes.map((s) => s.startTime)).toEqual([earlier, later]);
    expect(result[1].showtimes).toEqual([]);
  });
});
