# Omniplex-Style Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Sketchfab/GSAP two-act scroll-jacking homepage with a plain, server-rendered vertical list of movie cards (poster, title, IMDb rating, synopsis, per-showtime "Book" buttons), modeled on Omniplex Cinemas, with red pushed forward as the dominant accent color.

**Architecture:** `app/page.tsx` goes back to being a plain async Server Component (no client JavaScript, no GSAP, no third-party embed) — the same shape as `/showtimes` and `/about`. A new query, `getNowShowingWithShowtimes()`, fetches every movie together with its showtimes in one round trip. Everything the previous 3D homepage introduced (`app/cinema-home.tsx`, the `lib/homepage/*` helpers, the Sketchfab ambient types, the `gsap` dependency) is deleted.

**Tech Stack:** Next.js 16 App Router (Server Components only for this feature), CSS Modules, Vitest, Playwright — no new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-28-omniplex-style-homepage-design.md`.
- No client-side JavaScript, animation library, or third-party embed for this page.
- `Movie` has no genre or content-rating field — do not add UI for data that doesn't exist.
- A movie with zero currently-scheduled showtimes still appears in the list; its card just has no Book buttons (no "no showtimes" placeholder text).
- Book buttons use the exact same link target and label convention already established elsewhere in the app: `href="/book/{showtimeId}"`, label `Book — {formatShowtime(startTime)}`.
- Red (`--color-accent`) is used as a **solid fill** for buttons/badges on this page, not the muted/translucent treatment (`--color-accent-muted`) used for showtime chips elsewhere — this is the "push red forward" requirement.
- No new CSS custom properties — reuse the existing tokens in `app/globals.css`.

---

### Task 1: `getNowShowingWithShowtimes` query

**Files:**
- Modify: `lib/db/queries.ts`
- Test: `tests/integration/queries.test.ts`

**Interfaces:**
- Consumes: `movies`, `showtimes`, `bookings`, `bookingSeats` (`lib/db/schema.ts`), `rowToMovie`/`rowToShowtime` (already defined in `lib/db/queries.ts`).
- Produces: `getNowShowingWithShowtimes(db?): Promise<Array<Movie & { showtimes: Showtime[] }>>` — Task 2's homepage imports this directly.

- [ ] **Step 1: Write the failing test**

`tests/integration/queries.test.ts` is an existing file with ONE top-level `describe('movie and showtime queries', () => { ... })` block containing a shared `beforeEach` (cleans `bookingSeats`/`bookings`/`showtimes`/`movies`) and flat `it(...)` blocks per behavior — not a separate nested `describe` per function. Add a new `it(...)` block matching that structure, inside the existing `describe`, alongside the other tests already there (do not create a new `describe` block, and do not create a new file):

```ts
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
```

Add `getNowShowingWithShowtimes` to the existing `import { getNowShowing, getMovieById, getShowtimesForMovie, getAllShowtimes } from '../../lib/db/queries';` line at the top of the file — extend that same import, don't add a second one.

- [ ] **Step 2: Run test to verify it fails**

```bash
set -a; source .env.local; set +a
npx vitest run tests/integration/queries.test.ts
```

Expected: FAIL — `getNowShowingWithShowtimes` is not exported from `lib/db/queries.ts`.

- [ ] **Step 3: Write the implementation**

In `lib/db/queries.ts`, add this function (place it near `getNowShowing`):

```ts
export async function getNowShowingWithShowtimes(db: Database = defaultDb): Promise<Array<Movie & { showtimes: Showtime[] }>> {
  const movieRows = await db.select().from(movies).orderBy(movies.title);
  const showtimeRows = await db.select().from(showtimes).orderBy(showtimes.startTime);

  const showtimesByMovieId = new Map<number, Showtime[]>();
  for (const row of showtimeRows) {
    const showtime = rowToShowtime(row);
    const existing = showtimesByMovieId.get(showtime.movieId) ?? [];
    existing.push(showtime);
    showtimesByMovieId.set(showtime.movieId, existing);
  }

  return movieRows.map((row) => ({
    ...rowToMovie(row),
    showtimes: showtimesByMovieId.get(row.id) ?? [],
  }));
}
```

(Two queries plus an in-memory group-by, not a single JOIN — at this project's scale (one screen, a handful of movies) this is simpler and avoids the NULL-row handling a `LEFT JOIN` would need for movies with zero showtimes. `movies`, `showtimes`, `rowToMovie`, `rowToShowtime` are already imported/defined in this file — no new imports needed.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/integration/queries.test.ts
```

Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts tests/integration/queries.test.ts
git commit -m "feat: add getNowShowingWithShowtimes query"
```

---

### Task 2: Homepage rebuild

**Files:**
- Modify: `app/page.tsx`
- Create: `app/page.module.css`
- Modify: `tests/e2e/browse-movies.spec.ts`

**Interfaces:**
- Consumes: `getNowShowingWithShowtimes` (Task 1), `formatShowtime` (existing, `lib/format.ts`).
- Produces: nothing new for later tasks.

`app/page.tsx` currently renders `<CinemaHome movies={...} />` (the Sketchfab/GSAP component). This task replaces its contents entirely with a plain Server Component. `app/page.module.css` does not exist yet (the previous homepage redesign deleted it) — this task recreates it for the new card layout. `app/cinema-home.tsx`/`app/cinema-home.module.css` are left in place, now unused, for Task 3 to remove.

Each card must render the poster and title as **separate, non-nested elements** — do not wrap the poster in a `<Link>` alongside the title in a *different* `<Link>`: two separate links both containing the movie's title text as part of their accessible name causes `tests/e2e/browse-movies.spec.ts`'s existing `page.getByRole('link', { name: new RegExp(title) })` locator to match two elements and throw a Playwright strict-mode violation. Keep the poster a plain `<img>` (not wrapped in a link) and put the only link on the title text, exactly as shown below.

- [ ] **Step 1: Update the failing E2E assertion**

Add a new test to `tests/e2e/browse-movies.spec.ts`, inside the existing `describe` block (after the two tests already there):

```ts
  test('shows a Book button for the fixture movie\'s showtime', async ({ page }) => {
    await page.goto('/');
    const bookLink = page.getByRole('link', { name: /^Book — / });
    await expect(bookLink).toBeVisible();
    await bookLink.click();
    await expect(page).toHaveURL(/\/book\/\d+/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
set -a; source .env.local; set +a
npm run seed:fixture
npm run test:e2e -- tests/e2e/browse-movies.spec.ts
```

Expected: the new test FAILs — no "Book — " link exists on the homepage yet.

- [ ] **Step 3: Create the stylesheet**

Create `app/page.module.css`:

```css
.empty {
  color: var(--color-fg-muted);
}

.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.card {
  display: flex;
  gap: var(--space-lg);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.poster {
  flex: 0 0 auto;
  width: 120px;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}

.details {
  flex: 1;
  min-width: 0;
}

.title {
  margin-bottom: var(--space-xs);
}

.title a {
  color: var(--color-fg);
}

.title a:hover {
  color: var(--color-accent-text);
}

.ratingBadge {
  display: inline-block;
  background: var(--color-accent);
  color: var(--color-fg);
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: var(--space-sm);
}

.synopsis {
  color: var(--color-fg-muted);
  line-height: 1.6;
  margin-bottom: var(--space-md);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.showtimeList {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  list-style: none;
}

.bookButton {
  display: inline-block;
  background: var(--color-accent);
  color: var(--color-fg);
  font-size: 0.85rem;
  font-weight: 600;
  padding: var(--space-xs) var(--space-md);
  border-radius: 4px;
}

.bookButton:hover {
  background: var(--color-accent-text);
}
```

- [ ] **Step 4: Rewrite the page**

Replace the full contents of `app/page.tsx`:

```tsx
import Link from 'next/link';
import { getNowShowingWithShowtimes } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';
import styles from './page.module.css';

// Render on every request. Without this, Next.js prerenders this page at build
// time and bakes the build-time database contents into static HTML, so
// re-seeding the database would have no effect until the next deploy.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const movies = await getNowShowingWithShowtimes();

  return (
    <main>
      <h1>Now Showing at RetfenyMozi</h1>
      {movies.length === 0 ? (
        <p className={styles.empty}>No movies are scheduled right now — check back soon.</p>
      ) : (
        <ul className={styles.list}>
          {movies.map((movie) => (
            <li key={movie.id} className={styles.card}>
              {movie.posterUrl ? (
                <img src={movie.posterUrl} alt={`${movie.title} poster`} className={styles.poster} />
              ) : (
                <img
                  src="/placeholder-poster.svg"
                  alt={`${movie.title} poster placeholder`}
                  className={styles.poster}
                />
              )}
              <div className={styles.details}>
                <h2 className={styles.title}>
                  <Link href={`/movies/${movie.id}`}>{movie.title}</Link>
                </h2>
                {movie.imdbRating !== null && (
                  <span className={styles.ratingBadge}>{movie.imdbRating.toFixed(1)} / 10</span>
                )}
                <p className={styles.synopsis}>{movie.synopsis}</p>
                {movie.showtimes.length > 0 && (
                  <ul className={styles.showtimeList}>
                    {movie.showtimes.map((showtime) => (
                      <li key={showtime.id}>
                        <Link href={`/book/${showtime.id}`} className={styles.bookButton}>
                          Book — {formatShowtime(showtime.startTime)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0 (the two `<img>` tags will produce the same `@next/next/no-img-element` warning already accepted elsewhere in this codebase — not an error).

- [ ] **Step 6: Run test to verify it passes**

```bash
npm run test:e2e -- tests/e2e/browse-movies.spec.ts
```

Expected: PASS (3 tests — the two pre-existing ones plus the new Book-button test).

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx app/page.module.css tests/e2e/browse-movies.spec.ts
git commit -m "feat: rebuild homepage as an Omniplex-style movie card list"
```

---

### Task 3: Remove the Sketchfab/GSAP homepage and its dependencies

**Files:**
- Delete: `app/cinema-home.tsx`
- Delete: `app/cinema-home.module.css`
- Delete: `lib/homepage/scroll-scene.ts`
- Delete: `tests/unit/scroll-scene.test.ts`
- Delete: `lib/homepage/sketchfab-camera.ts`
- Delete: `tests/unit/sketchfab-camera.test.ts`
- Delete: `lib/types/sketchfab.d.ts`
- Delete: `tests/e2e/cinema-scroll-scene.spec.ts`
- Modify: `package.json` (remove `gsap`)

**Interfaces:**
- Consumes: nothing — this task only removes code nothing else references after Task 2 landed.
- Produces: nothing.

By this point, `app/page.tsx` (Task 2) no longer imports `CinemaHome`, so nothing in the app references any of these files. Confirm that before deleting, then remove them and the now-unused `gsap` dependency, and run the full project regression suite as this plan's final check.

- [ ] **Step 1: Confirm nothing still references the files being removed**

```bash
grep -rn "cinema-home\|homepage/scroll-scene\|homepage/sketchfab-camera\|types/sketchfab" app lib tests --include="*.ts" --include="*.tsx" | grep -v "^app/cinema-home\|^lib/homepage/\|^lib/types/sketchfab\|^tests/unit/scroll-scene\|^tests/unit/sketchfab-camera\|^tests/e2e/cinema-scroll-scene"
```

Expected: no output (every remaining reference is inside the files being deleted themselves). If this prints anything else, stop and report it — something still depends on the code this task is about to remove.

- [ ] **Step 2: Delete the files**

```bash
git rm app/cinema-home.tsx app/cinema-home.module.css
git rm lib/homepage/scroll-scene.ts tests/unit/scroll-scene.test.ts
git rm lib/homepage/sketchfab-camera.ts tests/unit/sketchfab-camera.test.ts
git rm lib/types/sketchfab.d.ts
git rm tests/e2e/cinema-scroll-scene.spec.ts
```

(`lib/homepage/` and `lib/types/` will now be empty directories — that's fine, git doesn't track empty directories, no further action needed.)

- [ ] **Step 3: Remove the `gsap` dependency**

```bash
npm uninstall gsap
```

- [ ] **Step 4: Run the full regression suite**

```bash
set -a; source .env.local; set +a
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run seed:fixture
npm run test:e2e
```

Expected: lint 0 errors, typecheck clean, unit and integration suites fully green (with fewer tests than before this task — the deleted `scroll-scene.test.ts`/`sketchfab-camera.test.ts` are gone), every E2E spec passes except the pre-existing, already-documented `tests/e2e/booking.spec.ts` failure (a dummy Stripe test key in this local environment, unrelated to this plan — confirm that's the only failure, if any).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove the Sketchfab/GSAP homepage and its dependencies"
```

---

## Self-Review Notes

- **Spec coverage:** Data (`getNowShowingWithShowtimes`) → Task 1. Layout (heading, card list, poster, title link, rating badge, synopsis excerpt, per-showtime Book buttons, empty state) → Task 2. Color (solid-fill red on buttons/badges, no new tokens) → Task 2's CSS. Removal of everything the previous redesign introduced → Task 3. Testing (query integration test, existing E2E assertions still passing, new Book-button E2E assertion) → Tasks 1 and 2.
- **Type consistency checked:** `getNowShowingWithShowtimes`'s return type (`Array<Movie & { showtimes: Showtime[] }>`) is exactly what Task 2's `movies.map()` and its nested `movie.showtimes.map()` consume — traced field-by-field (`movie.id`, `movie.posterUrl`, `movie.title`, `movie.imdbRating`, `movie.synopsis`, `showtime.id`, `showtime.startTime`). `formatShowtime` and the `Book — <time>` label/`/book/{id}` href pattern match the identical convention already used on the movie detail and showtimes pages from the prior sub-project, unchanged.
- **No placeholders:** every step has literal file contents or literal commands.
- **Known test-collision risk addressed during planning, not left for the implementer to discover:** an earlier draft of Task 2's card markup wrapped both the poster and the title in separate `<Link>` elements, which would have made `browse-movies.spec.ts`'s existing `getByRole('link', { name: regex })` locator match two elements (the poster's alt text and the title both contain the movie's title as a substring) and throw a Playwright strict-mode violation. Fixed by keeping the poster a plain, non-linking `<img>` — called out explicitly in Task 2's own text so the implementer doesn't reintroduce it.
