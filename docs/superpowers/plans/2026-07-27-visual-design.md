# RetfenyMozi Visual Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a dark cinematic visual identity (crimson accent, serif headings via Playfair Display, Geist Sans body) consistently across all four existing RetfenyMozi pages, using plain CSS and CSS Modules only.

**Architecture:** Design tokens (colors, fonts, spacing) live as CSS custom properties in `app/globals.css`, applied globally. Each page gets a colocated `page.module.css` for its own layout (poster grid, hero banner, list). No new routes, data, or business logic — every change is presentational.

**Tech Stack:** Next.js 15 App Router, `next/font/google` (adding Playfair Display alongside the existing but currently-unused Geist), CSS Modules (built into Next.js, no new dependency).

## Global Constraints

- Always dark theme — no `prefers-color-scheme` light variant. (spec: Visual Language)
- Palette: background `#0b0b0d`, foreground `#f2ede7`, muted foreground `#c9c2b8`, accent `#b8272c`. (spec: Visual Language)
- Headings and movie titles use the serif font (Playfair Display); body text, nav, and UI chrome use Geist Sans. (spec: Visual Language)
- No new npm dependency beyond the one Google Font — plain CSS + CSS Modules only, no Tailwind or CSS-in-JS. (spec: Structure)
- Styling-only change: no new routes, no changes to `lib/db/queries.ts`, `lib/format.ts`, or any seed/API script. Every existing Playwright E2E assertion (movie title as a heading, movie title as a link's accessible name, synopsis/director/cast/rating text, "Watch trailer" link + href, formatted showtime text) must keep passing unchanged. (spec: Testing)
- Poster grid must be responsive via CSS Grid `auto-fill`, not a hardcoded column count. (spec: Responsiveness)

---

## File Structure

```
app/
  globals.css              # Modify: design tokens, always-dark base styles, nav styles
  layout.tsx                # Modify: add Playfair Display font, nav wordmark markup
  page.tsx                  # Modify: apply CSS module classes (home page)
  page.module.css           # Create: poster grid layout
  movies/[id]/
    page.tsx                # Modify: apply CSS module classes (hero banner)
    page.module.css         # Create: hero banner + meta/synopsis/trailer/showtimes layout
  showtimes/
    page.tsx                # Modify: apply CSS module classes (list layout)
    page.module.css         # Create: showtimes list layout
  about/
    page.tsx                # Modify: apply CSS module classes (simple text layout)
    page.module.css         # Create: about page text layout
```

---

### Task 1: Design tokens, global base styles, and nav

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: CSS custom properties `--color-bg`, `--color-fg`, `--color-fg-muted`, `--color-accent`, `--color-accent-muted`, `--font-heading`, `--font-body`, `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl` — every later task's CSS Module reads these, not literal color/font values.
- Produces: global element styles for `main`, `h1`/`h2`/`h3`, `a` — later tasks' CSS Modules only add page-specific layout, not repeat these.
- Produces: `.site-nav`, `.site-nav .wordmark`, `.site-nav .links` global classes, applied in this task's `layout.tsx` change.

- [ ] **Step 1: Replace `app/globals.css`**

Replace the entire contents of `app/globals.css` with:

```css
:root {
  --color-bg: #0b0b0d;
  --color-fg: #f2ede7;
  --color-fg-muted: #c9c2b8;
  --color-accent: #b8272c;
  --color-accent-muted: rgba(184, 39, 44, 0.25);
  --font-heading: var(--font-playfair), Georgia, 'Times New Roman', serif;
  --font-body: var(--font-geist-sans), Arial, Helvetica, sans-serif;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 40px;
}

html {
  height: 100%;
  color-scheme: dark;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--color-fg);
  background: var(--color-bg);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

a {
  color: var(--color-accent);
  text-decoration: none;
}

h1,
h2,
h3 {
  font-family: var(--font-heading);
  font-weight: 700;
  line-height: 1.2;
}

main {
  flex: 1;
  padding: var(--space-lg);
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
}

.site-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid rgba(242, 237, 231, 0.1);
}

.site-nav .wordmark {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-fg);
}

.site-nav .links {
  display: flex;
  gap: var(--space-lg);
}

.site-nav .links a {
  font-size: 0.75rem;
  font-family: var(--font-body);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-fg-muted);
}

.site-nav .links a:hover {
  color: var(--color-fg);
}
```

This removes the old `@media (prefers-color-scheme: dark)` blocks entirely — the site is always dark now, not conditional on system preference.

- [ ] **Step 2: Update `app/layout.tsx`**

Replace the entire contents of `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RetfenyMozi — Local Cinema",
  description:
    "Now showing, showtimes, and visitor information for RetfenyMozi, a small single-screen local cinema.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable}`}
    >
      <body>
        <nav className="site-nav">
          <Link href="/" className="wordmark">
            RetfenyMozi
          </Link>
          <div className="links">
            <Link href="/">Now Showing</Link>
            <Link href="/showtimes">Showtimes</Link>
            <Link href="/about">About</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0. (The pre-existing `@next/next/no-img-element` warnings on `app/page.tsx` and `app/movies/[id]/page.tsx` are unrelated to this task and will still appear until Tasks 2–3 touch those files — that's expected, not a regression.)

- [ ] **Step 4: Run the full E2E suite to confirm nothing broke globally**

```bash
docker compose up -d db
set -a; source .env.local; set +a
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
npm run test:e2e
```

Expected: 4 passed (this task doesn't touch page content, only global chrome — the existing fixture-seeding E2E tests should be unaffected).

- [ ] **Step 5: Visual check — confirm dark theme and fonts load**

Write this script to `screenshot-check.mjs` in the project root (must be run from the project root so `@playwright/test` resolves via `node_modules`):

```js
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000/about', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/retfenymozi-task1-about.png', fullPage: true });
await page.close();
await browser.close();
```

Then run:

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
nohup npm run dev > /tmp/retfenymozi-dev.log 2>&1 &
until curl -sf http://localhost:3000/about >/dev/null 2>&1; do sleep 1; done
node screenshot-check.mjs
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
rm screenshot-check.mjs
```

Read `/tmp/retfenymozi-task1-about.png` and confirm: dark background (`#0b0b0d`), warm off-white text, a "RetfenyMozi" wordmark in a serif font on the left of the nav, and "Now Showing" / "Showtimes" / "About" as small uppercase letter-spaced links on the right.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add dark cinematic design tokens, base styles, and nav"
```

---

### Task 2: Home page poster grid

**Files:**
- Modify: `app/page.tsx`
- Create: `app/page.module.css`

**Interfaces:**
- Consumes: `--color-fg-muted`, `--color-fg`, `--space-sm`, `--space-md` (Task 1)
- Consumes: `getNowShowing()` from `lib/db/queries.ts` — unchanged, do not modify.

- [ ] **Step 1: Create `app/page.module.css`**

```css
.empty {
  color: var(--color-fg-muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-md);
  list-style: none;
}

.card {
  position: relative;
}

.cardLink {
  position: relative;
  display: block;
  aspect-ratio: 2 / 3;
  border-radius: 4px;
  overflow: hidden;
  background: var(--color-bg);
}

.poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cardTitle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding: var(--space-sm);
  font-size: 1rem;
  color: var(--color-fg);
  background: linear-gradient(to top, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0) 80%);
}
```

- [ ] **Step 2: Update `app/page.tsx`**

Replace the entire contents of `app/page.tsx` with:

```tsx
import Link from 'next/link';
import { getNowShowing } from '@/lib/db/queries';
import styles from './page.module.css';

// Render on every request. Without this, Next.js prerenders this page at build
// time and bakes the build-time database contents into static HTML, so
// re-seeding the database would have no effect until the next deploy.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const movies = await getNowShowing();

  return (
    <main>
      <h1>Now Showing at RetfenyMozi</h1>
      {movies.length === 0 ? (
        <p className={styles.empty}>No movies are scheduled right now — check back soon.</p>
      ) : (
        <ul className={styles.grid}>
          {movies.map((movie) => (
            <li key={movie.id} className={styles.card}>
              <Link href={`/movies/${movie.id}`} className={styles.cardLink}>
                {movie.posterUrl ? (
                  <img src={movie.posterUrl} alt={`${movie.title} poster`} className={styles.poster} />
                ) : (
                  <img
                    src="/placeholder-poster.svg"
                    alt={`${movie.title} poster placeholder`}
                    className={styles.poster}
                  />
                )}
                <h2 className={styles.cardTitle}>{movie.title}</h2>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

Note: the movie title stays an `<h2>` inside the `<Link>`, exactly as before — only its styling changes (absolutely positioned over the poster with a gradient scrim). This preserves `getByRole('heading', { name: ... })` and the link's accessible name that `tests/e2e/browse-movies.spec.ts` depends on. The `width={92}` attribute is removed from the `<img>` since sizing is now controlled by the CSS grid/aspect-ratio.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0 (the `@next/next/no-img-element` warning on this file is pre-existing and expected).

- [ ] **Step 4: Run the browse-movies E2E test**

```bash
docker compose up -d db
set -a; source .env.local; set +a
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
npm run test:e2e -- tests/e2e/browse-movies.spec.ts
```

Expected: 2 passed.

- [ ] **Step 5: Visual check — confirm the grid is responsive**

Write this script to `screenshot-check.mjs` in the project root:

```js
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
for (const [label, width] of [['desktop', 1280], ['mobile', 375]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `/tmp/retfenymozi-task2-${label}.png`, fullPage: true });
  await page.close();
}
await browser.close();
```

Then run:

```bash
npm run seed:fixture
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
nohup npm run dev > /tmp/retfenymozi-dev.log 2>&1 &
until curl -sf http://localhost:3000/ >/dev/null 2>&1; do sleep 1; done
node screenshot-check.mjs
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
rm screenshot-check.mjs
```

Read both `/tmp/retfenymozi-task2-desktop.png` and `/tmp/retfenymozi-task2-mobile.png`. Confirm: the fixture movie ("The Operational Engineer") appears as a poster card with its title legible over a dark gradient at the bottom, and the grid is visibly narrower (fewer/no extra empty columns) at 375px than at 1280px.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/page.module.css
git commit -m "feat: style home page as a poster grid"
```

---

### Task 3: Movie detail hero banner

**Files:**
- Modify: `app/movies/[id]/page.tsx`
- Create: `app/movies/[id]/page.module.css`

**Interfaces:**
- Consumes: `--color-bg`, `--color-fg`, `--color-fg-muted`, `--color-accent`, `--color-accent-muted`, `--space-*` (Task 1)
- Consumes: `getMovieById`, `getShowtimesForMovie` from `lib/db/queries.ts`, `formatShowtime` from `lib/format.ts` — unchanged, do not modify.

- [ ] **Step 1: Create `app/movies/[id]/page.module.css`**

```css
.hero {
  position: relative;
  min-height: 240px;
  display: flex;
  align-items: flex-end;
  padding: var(--space-lg);
  margin: calc(var(--space-lg) * -1) calc(var(--space-lg) * -1) var(--space-lg);
  background-size: cover;
  background-position: center;
  background-color: var(--color-bg);
}

.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(11, 11, 13, 0.95),
    rgba(11, 11, 13, 0.55) 60%,
    rgba(11, 11, 13, 0.3)
  );
}

.heroTitle {
  position: relative;
  z-index: 1;
  color: var(--color-fg);
  font-size: 2rem;
  margin: 0;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-lg);
  margin-bottom: var(--space-md);
}

.metaItem dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-fg-muted);
  margin-bottom: 2px;
}

.metaItem dd {
  font-size: 0.95rem;
}

.ratingBadge {
  display: inline-block;
  background: var(--color-accent);
  color: var(--color-fg);
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 600;
}

.synopsis {
  color: var(--color-fg-muted);
  line-height: 1.6;
  margin-bottom: var(--space-md);
  max-width: 640px;
}

.trailerButton {
  display: inline-block;
  border: 1px solid var(--color-accent);
  color: var(--color-fg);
  padding: var(--space-xs) var(--space-md);
  border-radius: 4px;
  margin-bottom: var(--space-lg);
}

.trailerButton:hover {
  background: var(--color-accent-muted);
}

.empty {
  color: var(--color-fg-muted);
}

.showtimeList {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  list-style: none;
}

.showtimeChip {
  background: var(--color-accent-muted);
  color: var(--color-fg);
  font-size: 0.85rem;
  padding: var(--space-xs) var(--space-sm);
  border-radius: 3px;
}
```

- [ ] **Step 2: Update `app/movies/[id]/page.tsx`**

Replace the entire contents of `app/movies/[id]/page.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import { getMovieById, getShowtimesForMovie } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';
import styles from './page.module.css';

export default async function MovieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);

  // A non-numeric route param (e.g. /movies/abc) yields NaN, which Postgres
  // rejects as an integer parameter — 404 instead of an unhandled 500.
  if (!Number.isInteger(numericId)) {
    notFound();
  }

  const movie = await getMovieById(numericId);

  if (!movie) {
    notFound();
  }

  const showtimes = await getShowtimesForMovie(movie.id);
  const posterUrl = movie.posterUrl ?? '/placeholder-poster.svg';

  return (
    <main>
      <div
        className={styles.hero}
        style={{ backgroundImage: `url(${posterUrl})` }}
        role="img"
        aria-label={`${movie.title} poster`}
      >
        <h1 className={styles.heroTitle}>{movie.title}</h1>
      </div>
      <dl className={styles.meta}>
        <div className={styles.metaItem}>
          <dt>Director</dt>
          <dd>{movie.director ?? 'Unknown'}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt>Cast</dt>
          <dd>{movie.actors.length > 0 ? movie.actors.join(', ') : 'Unknown'}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt>Runtime</dt>
          <dd>{movie.runtime ? `${movie.runtime} min` : 'Unknown'}</dd>
        </div>
        {movie.imdbRating !== null && (
          <div className={styles.metaItem}>
            <dt>IMDb Rating</dt>
            <dd className={styles.ratingBadge}>{movie.imdbRating.toFixed(1)} / 10</dd>
          </div>
        )}
      </dl>
      <p className={styles.synopsis}>{movie.synopsis}</p>
      {movie.trailerUrl && (
        <p>
          <a
            href={movie.trailerUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.trailerButton}
          >
            Watch trailer
          </a>
        </p>
      )}
      <h2>Showtimes</h2>
      {showtimes.length === 0 ? (
        <p className={styles.empty}>No showtimes scheduled yet.</p>
      ) : (
        <ul className={styles.showtimeList}>
          {showtimes.map((showtime) => (
            <li key={showtime.id} className={styles.showtimeChip}>
              {formatShowtime(showtime.startTime)}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

Note: the standalone `<img>` poster is replaced by a CSS `background-image` on the hero banner (with `role="img"`/`aria-label` preserving accessibility) — this is the "full-bleed hero" from the spec, not a regression. All text content that `tests/e2e/movie-detail.spec.ts` asserts on (`movie.synopsis`, `movie.director`, `movie.actors.join(', ')`, `` `${imdbRating.toFixed(1)} / 10` ``, and the "Watch trailer" link + `href`) is unchanged — only the surrounding markup/classes changed.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0. (The `@next/next/no-img-element` warning that was previously on this file is gone now that the `<img>` tag is removed — that's an expected improvement, not something to investigate.)

- [ ] **Step 4: Run the movie-detail E2E test**

```bash
docker compose up -d db
set -a; source .env.local; set +a
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
npm run test:e2e -- tests/e2e/movie-detail.spec.ts
```

Expected: 1 passed.

- [ ] **Step 5: Visual check**

Write this script to `screenshot-check.mjs` in the project root:

```js
import { chromium } from '@playwright/test';
import { createDb } from './lib/db/client.ts';
import { movies } from './lib/db/schema.ts';

const db = createDb(process.env.DATABASE_URL);
const [movie] = await db.select().from(movies).limit(1);

const browser = await chromium.launch();
for (const [label, width] of [['desktop', 1280], ['mobile', 375]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`http://localhost:3000/movies/${movie.id}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `/tmp/retfenymozi-task3-${label}.png`, fullPage: true });
  await page.close();
}
await browser.close();
```

Then run:

```bash
npm run seed:fixture
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
nohup npm run dev > /tmp/retfenymozi-dev.log 2>&1 &
until curl -sf http://localhost:3000/ >/dev/null 2>&1; do sleep 1; done
npx tsx screenshot-check.mjs
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
rm screenshot-check.mjs
```

(Note: this script is run with `npx tsx`, not plain `node`, because it imports `.ts` files directly.)

Read both `/tmp/retfenymozi-task3-desktop.png` and `/tmp/retfenymozi-task3-mobile.png`. Confirm: a dark hero banner with the movie title readable over a gradient, an IMDb rating badge in the accent color, and showtime chips below the trailer button.

- [ ] **Step 6: Commit**

```bash
git add "app/movies/[id]/page.tsx" "app/movies/[id]/page.module.css"
git commit -m "feat: style movie detail page as a full-bleed hero banner"
```

---

### Task 4: Showtimes page list

**Files:**
- Modify: `app/showtimes/page.tsx`
- Create: `app/showtimes/page.module.css`

**Interfaces:**
- Consumes: `--color-fg-muted`, `--font-heading`, `--font-body`, `--space-*` (Task 1)
- Consumes: `getAllShowtimes()` from `lib/db/queries.ts`, `formatShowtime` from `lib/format.ts` — unchanged, do not modify.

- [ ] **Step 1: Create `app/showtimes/page.module.css`**

```css
.empty {
  color: var(--color-fg-muted);
}

.list {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md) 0;
  border-bottom: 1px solid rgba(242, 237, 231, 0.1);
}

.movieLink {
  font-family: var(--font-heading);
  font-size: 1.1rem;
}

.movieLink:hover {
  text-decoration: underline;
}

.time {
  font-size: 0.85rem;
  color: var(--color-fg-muted);
  font-family: var(--font-body);
}
```

- [ ] **Step 2: Update `app/showtimes/page.tsx`**

Replace the entire contents of `app/showtimes/page.tsx` with:

```tsx
import Link from 'next/link';
import { getAllShowtimes } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';
import styles from './page.module.css';

// Render on every request. Without this, Next.js prerenders this page at build
// time and bakes the build-time database contents into static HTML, so
// re-seeding the database would have no effect until the next deploy.
export const dynamic = 'force-dynamic';

export default async function ShowtimesPage() {
  const showtimes = await getAllShowtimes();

  return (
    <main>
      <h1>Showtimes</h1>
      {showtimes.length === 0 ? (
        <p className={styles.empty}>No showtimes scheduled right now.</p>
      ) : (
        <ul className={styles.list}>
          {showtimes.map((showtime) => (
            <li key={showtime.id} className={styles.row}>
              <Link href={`/movies/${showtime.movie.id}`} className={styles.movieLink}>
                {showtime.movie.title}
              </Link>
              <span className={styles.time}>{formatShowtime(showtime.startTime)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

Note: the literal `' — '` text separator between the movie link and the time is replaced by CSS `justify-content: space-between` layout. No test asserts on that separator — `tests/e2e/showtimes.spec.ts` checks the link and the formatted time text independently.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 4: Run the showtimes E2E test**

```bash
docker compose up -d db
set -a; source .env.local; set +a
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
npm run test:e2e -- tests/e2e/showtimes.spec.ts
```

Expected: 1 passed.

- [ ] **Step 5: Visual check**

Write this script to `screenshot-check.mjs` in the project root:

```js
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000/showtimes', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/retfenymozi-task4-showtimes.png', fullPage: true });
await page.close();
await browser.close();
```

Then run:

```bash
npm run seed:fixture
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
nohup npm run dev > /tmp/retfenymozi-dev.log 2>&1 &
until curl -sf http://localhost:3000/showtimes >/dev/null 2>&1; do sleep 1; done
node screenshot-check.mjs
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
rm screenshot-check.mjs
```

Read `/tmp/retfenymozi-task4-showtimes.png`. Confirm: a clean list with the movie title in serif on the left and the formatted showtime in muted text on the right of each row, separated by a thin bottom border.

- [ ] **Step 6: Commit**

```bash
git add app/showtimes/page.tsx app/showtimes/page.module.css
git commit -m "feat: style showtimes page as a list"
```

---

### Task 5: About page and final regression check

**Files:**
- Modify: `app/about/page.tsx`
- Create: `app/about/page.module.css`

**Interfaces:**
- Consumes: `--color-fg-muted`, `--space-md` (Task 1)

- [ ] **Step 1: Create `app/about/page.module.css`**

```css
.body {
  color: var(--color-fg-muted);
  line-height: 1.6;
  max-width: 640px;
  margin-bottom: var(--space-md);
}
```

- [ ] **Step 2: Update `app/about/page.tsx`**

Replace the entire contents of `app/about/page.tsx` with:

```tsx
import styles from './page.module.css';

export default function AboutPage() {
  return (
    <main>
      <h1>About RetfenyMozi</h1>
      <p className={styles.body}>
        RetfenyMozi is a small, single-screen local cinema showing a wide range of films —
        from new releases to classics.
      </p>
      <h2>Contact</h2>
      <p className={styles.body}>
        Email: <a href="mailto:info@retfenymozi.example">info@retfenymozi.example</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 4: Visual check**

Write this script to `screenshot-check.mjs` in the project root:

```js
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000/about', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/retfenymozi-task5-about.png', fullPage: true });
await page.close();
await browser.close();
```

Then run:

```bash
docker compose up -d db
set -a; source .env.local; set +a
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
nohup npm run dev > /tmp/retfenymozi-dev.log 2>&1 &
until curl -sf http://localhost:3000/about >/dev/null 2>&1; do sleep 1; done
node screenshot-check.mjs
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
rm screenshot-check.mjs
```

Read `/tmp/retfenymozi-task5-about.png`. Confirm: dark background, serif headings, readable muted body text — visually consistent with the home/detail/showtimes pages from Tasks 2–4.

- [ ] **Step 5: Full regression — run the entire test suite**

```bash
set -a; source .env.local; set +a
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
```

Expected: lint 0 errors, typecheck clean, unit 12/12, integration 6/6, e2e 4/4 — every existing test still passes after the full styling pass across all four pages.

- [ ] **Step 6: Commit**

```bash
git add app/about/page.tsx app/about/page.module.css
git commit -m "feat: style about page"
```

---

## Self-Review Notes

- **Spec coverage:** Visual Language (palette, theme mode, typography) → Task 1. Structure (design tokens, nav wordmark, CSS Modules approach) → Task 1. Home page poster grid → Task 2. Movie detail hero banner → Task 3. Showtimes list → Task 4. About page → Task 5. Responsiveness (poster grid `auto-fill`) → Task 2, verified at both desktop and mobile viewport widths. Testing (existing E2E suite keeps passing, no new visual-regression tooling) → every task runs its relevant E2E spec, Task 5 runs the full suite as a final check.
- **Type consistency checked:** every CSS Module class name referenced in a `page.tsx` (`styles.grid`, `styles.cardTitle`, `styles.hero`, `styles.metaItem`, `styles.row`, etc.) is defined in that same task's `page.module.css` — no cross-task class name drift, since each page's styles are self-contained to its own module file. The CSS custom property names introduced in Task 1 (`--color-bg`, `--color-fg`, `--color-fg-muted`, `--color-accent`, `--color-accent-muted`, `--font-heading`, `--font-body`, `--space-xs/sm/md/lg/xl`) are the exact names every later task's CSS Module references — verified no task introduces a differently-named or misspelled variable.
- **E2E safety checked:** for each of the three existing E2E spec files, traced every assertion (`getByRole('heading', ...)`, `getByRole('link', ...)`, `getByText(...)` for synopsis/director/cast/rating/showtime) against the exact JSX text output in Tasks 2–4 to confirm no visible text or accessible role/name changes — only surrounding markup and CSS classes change.
- **No placeholders:** every step has literal file contents, literal CSS, or literal commands; nothing is marked TBD.
