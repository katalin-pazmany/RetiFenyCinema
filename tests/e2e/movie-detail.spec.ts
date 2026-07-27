import { test, expect } from '@playwright/test';
import { createDb } from '../../lib/db/client';
import { seedFixture, FIXTURE_MOVIE } from '../../scripts/seed-fixture';

test.describe('movie detail page', () => {
  test.beforeAll(async () => {
    if (!process.env.BASE_URL) {
      await seedFixture(createDb(process.env.DATABASE_URL!));
    }
  });

  test('shows synopsis, director, cast, rating, and trailer link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: new RegExp(FIXTURE_MOVIE.title) }).click();

    await expect(page.getByText(FIXTURE_MOVIE.synopsis)).toBeVisible();
    await expect(page.getByText(FIXTURE_MOVIE.director)).toBeVisible();
    await expect(page.getByText(FIXTURE_MOVIE.actors.join(', '))).toBeVisible();
    await expect(page.getByText('8.5 / 10')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Watch trailer' })).toHaveAttribute(
      'href',
      FIXTURE_MOVIE.trailerUrl,
    );
  });

  test('shows an explicit Book button for the showtime', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: new RegExp(FIXTURE_MOVIE.title) }).click();

    await expect(page.getByRole('link', { name: /^Book — / })).toBeVisible();
  });
});
