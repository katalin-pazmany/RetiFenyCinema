import { test, expect } from '@playwright/test';
import { createDb } from '../../lib/db/client';
import { seedFixture, FIXTURE_MOVIE, FIXTURE_SHOWTIME_START } from '../../scripts/seed-fixture';
import { formatShowtime } from '../../lib/format';

test.describe('showtimes page', () => {
  test.beforeAll(async () => {
    if (!process.env.BASE_URL) {
      await seedFixture(createDb(process.env.DATABASE_URL!));
    }
  });

  test('lists the fixture movie with its formatted showtime', async ({ page }) => {
    await page.goto('/showtimes');
    await expect(page.getByRole('link', { name: FIXTURE_MOVIE.title })).toBeVisible();
    await expect(page.getByText(formatShowtime(FIXTURE_SHOWTIME_START))).toBeVisible();
  });
});
