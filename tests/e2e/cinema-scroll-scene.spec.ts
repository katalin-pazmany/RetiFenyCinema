import { test, expect } from '@playwright/test';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, bookings, bookingSeats } from '../../lib/db/schema';

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
      // This spec never inserts booking-related rows, so there's no FK
      // reason to touch seats/ticketTypes — deleting them here (with no
      // reseed afterward) used to silently leave the shared local DB
      // without seat/ticket-type data for whichever test ran next.
      await db.delete(bookingSeats);
      await db.delete(bookings);
      await db.delete(showtimes);
      await db.delete(movies);

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

    // With 2+ movies, showPosterScrub is true on the server, so the poster
    // track is present in the initial server-rendered HTML — DOM presence
    // isn't gated by scrolling at all.
    await expect(page.getByRole('link', { name: 'The First Feature' })).toBeAttached();
    await expect(page.getByRole('link', { name: 'The Second Feature' })).toBeAttached();

    // Clicking IS gated by scroll, though: per the design spec's "handoff",
    // the poster track is inert (opacity: 0, pointer-events: none) until
    // the camera finishes turning to face the screen. Scroll well past
    // that handoff before attempting to interact with a poster link.
    await page.mouse.wheel(0, 6000);

    await page.getByRole('link', { name: 'The Second Feature' }).click();
    await expect(page).toHaveURL(/\/movies\/\d+/);
    await expect(page.getByText(SECOND_MOVIE.synopsis)).toBeVisible();
  });
});
