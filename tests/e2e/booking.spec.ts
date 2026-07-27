import { test, expect } from '@playwright/test';
import { createDb } from '../../lib/db/client';
import { seedFixture, FIXTURE_MOVIE, FIXTURE_SHOWTIME_START } from '../../scripts/seed-fixture';
import { seedSeats } from '../../scripts/seed-seats';
import { movies, showtimes } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';

test.describe('booking flow', () => {
  test.beforeAll(async () => {
    if (!process.env.BASE_URL) {
      const db = createDb(process.env.DATABASE_URL!);
      await seedFixture(db);
      await seedSeats(db);
    }
  });

  test('selecting seats and submitting redirects to a Stripe Checkout URL', async ({ page }) => {
    const db = createDb(process.env.DATABASE_URL!);
    const [movie] = await db.select().from(movies).where(eq(movies.title, FIXTURE_MOVIE.title)).limit(1);
    const [showtime] = await db
      .select()
      .from(showtimes)
      .where(eq(showtimes.movieId, movie.id))
      .limit(1);

    await page.goto(`/book/${showtime.id}`);

    await page.fill('#qty-1', '1'); // ticket type ids are seeded in insertion order: 1 = adult
    await page.fill('#customerName', 'E2E Test');
    await page.fill('#customerEmail', 'e2e@example.com');

    const availableSeatButton = page.locator('button[aria-label^="Seat"]:not([disabled])').first();
    await availableSeatButton.click();

    await page.getByRole('button', { name: 'Continue to payment' }).click();

    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 });
  });
});
