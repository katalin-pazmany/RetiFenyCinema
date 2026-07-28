import { test, expect } from '@playwright/test';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, bookings, bookingSeats, seats, ticketTypes } from '../../lib/db/schema';

const SECOND_MOVIE = {
  tmdbId: 900010,
  imdbId: 'tt9000010',
  title: 'The Second Feature',
  synopsis: 'A second fixture movie so the homepage has enough content to scroll-scrub.',
  posterUrl: null,
  runtime: 95,
  director: 'Test Director',
  actors: ['Test Actor'],
  imdbRating: '7.0',
  trailerUrl: null,
};

test.describe('homepage cinema scroll scene', () => {
  test.beforeAll(async () => {
    if (!process.env.BASE_URL) {
      const db = createDb(process.env.DATABASE_URL!);
      await db.delete(bookingSeats);
      await db.delete(bookings);
      await db.delete(showtimes);
      await db.delete(movies);
      await db.delete(seats);
      await db.delete(ticketTypes);

      const [movieOne] = await db
        .insert(movies)
        .values({
          tmdbId: 900009,
          imdbId: 'tt9000009',
          title: 'The First Feature',
          synopsis: 'A fixture movie for the scroll-scene test.',
          posterUrl: null,
          runtime: 100,
          director: 'Test Director',
          actors: ['Test Actor'],
          imdbRating: '8.0',
          trailerUrl: null,
        })
        .returning();
      const [movieTwo] = await db.insert(movies).values(SECOND_MOVIE).returning();
      await db.insert(showtimes).values([
        { movieId: movieOne.id, startTime: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        { movieId: movieTwo.id, startTime: new Date(Date.now() + 48 * 60 * 60 * 1000) },
      ]);
    }
  });

  test('both movies are present and reachable with 2+ movies showing', async ({ page }) => {
    await page.goto('/');

    // The poster track only reveals itself after scrolling well into the
    // pinned scene (past act one's camera phase) — scroll deep enough that
    // both posters are guaranteed to have rendered into the DOM, without
    // asserting on the animation's exact pixel position (out of scope per
    // the design spec's testing section).
    await page.mouse.wheel(0, 6000);

    await expect(page.getByRole('link', { name: 'The First Feature' })).toBeAttached();
    await expect(page.getByRole('link', { name: 'The Second Feature' })).toBeAttached();

    await page.getByRole('link', { name: 'The Second Feature' }).click();
    await expect(page).toHaveURL(/\/movies\/\d+/);
    await expect(page.getByText(SECOND_MOVIE.synopsis)).toBeVisible();
  });
});
