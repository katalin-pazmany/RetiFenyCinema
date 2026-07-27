import { test, expect } from '@playwright/test';
import { createDb } from '../../lib/db/client';
import { seedFixture, FIXTURE_MOVIE, FIXTURE_SHOWTIME_START } from '../../scripts/seed-fixture';
import { formatShowtime } from '../../lib/format';

// formatShowtime() runs here in the Playwright process, but the text on the
// page was rendered by a separate Next.js process (locally `next dev`, in CI a
// Vercel deployment). Those two can run different Node/ICU versions, which
// disagree on whether the separator before AM/PM is a regular space (U+0020)
// or a narrow no-break space (U+202F). Match on a whitespace-agnostic pattern
// so the assertion tests the content, not the ICU build.
function whitespaceAgnostic(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace(/\s/g, '\\s'));
}

test.describe('showtimes page', () => {
  test.beforeAll(async () => {
    if (!process.env.BASE_URL) {
      await seedFixture(createDb(process.env.DATABASE_URL!));
    }
  });

  test('lists the fixture movie with a Book link for its showtime', async ({ page }) => {
    await page.goto('/showtimes');
    await expect(page.getByRole('link', { name: FIXTURE_MOVIE.title })).toBeVisible();

    const bookLink = page.getByRole('link', { name: whitespaceAgnostic(`Book — ${formatShowtime(FIXTURE_SHOWTIME_START)}`) });
    await expect(bookLink).toBeVisible();
    await expect(bookLink).toHaveAttribute('href', /^\/book\/\d+$/);
  });
});
