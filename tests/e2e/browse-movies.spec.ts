import { test, expect } from '@playwright/test';
import { createDb } from '../../lib/db/client';
import { seedFixture, FIXTURE_MOVIE } from '../../scripts/seed-fixture';

test.describe('browsing movies', () => {
  test.beforeAll(async () => {
    if (!process.env.BASE_URL) {
      await seedFixture(createDb(process.env.DATABASE_URL!));
    }
  });

  test('home page lists the fixture movie', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: FIXTURE_MOVIE.title })).toBeVisible();
  });

  test('clicking a movie navigates to its detail page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: new RegExp(FIXTURE_MOVIE.title) }).click();
    await expect(page).toHaveURL(/\/movies\/\d+/);
    await expect(page.getByText(FIXTURE_MOVIE.synopsis)).toBeVisible();
  });

  test('shows a Book button for the fixture movie\'s showtime', async ({ page }) => {
    await page.goto('/');
    const bookLink = page.getByRole('link', { name: /^Book — / });
    await expect(bookLink).toBeVisible();
    await bookLink.click();
    await expect(page).toHaveURL(/\/book\/\d+/);
  });
});
