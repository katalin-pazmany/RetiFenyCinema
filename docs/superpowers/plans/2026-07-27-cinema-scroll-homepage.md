# Cinema Scroll Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RetfenyMozi's homepage poster grid with a two-act, scroll-driven cinema experience (a 3D auditorium that scroll-rotates toward the screen, then a poster scroll-scrub once facing it), and fix the sitewide missing "Book" call-to-action.

**Architecture:** `app/page.tsx` stays a Server Component fetching `getNowShowing()` and hands the movie list to a new `'use client'` component (`app/cinema-home.tsx`) that owns a single combined GSAP ScrollTrigger spanning both acts: the first portion of its scroll progress drives a Sketchfab-embedded 3D model's camera (via the Sketchfab Viewer API), the remainder drives a horizontal poster-track translation once the camera has settled facing the screen. Two small pure helper modules (`lib/homepage/scroll-scene.ts`, `lib/homepage/sketchfab-camera.ts`) hold the testable logic; the component itself is UI glue, verified manually via the dev server (this codebase has no React component-testing setup — Playwright E2E is the layer that verifies rendered behavior, matching the pattern already used for the booking page's seat map).

**Tech Stack:** Next.js 16 App Router, React 19, GSAP + ScrollTrigger (new dependency), the Sketchfab Viewer API (loaded via `next/script`, no npm package, no API key required), CSS Modules, Vitest, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-cinema-scroll-homepage-design.md`.
- Sketchfab model UID: `d680d16468f44cc1aefa90d0d996a26f` ("VR Cinema" by Leandro Nicolas).
- Sketchfab attribution ("VR Cinema by Leandro Nicolas on Sketchfab", linking to the model, the author, and Sketchfab) must remain visible on the page — this is a license requirement, not a design option.
- The poster-scroll pin/scrub only activates when at least 2 movies are showing (`MIN_MOVIES_FOR_SCROLL_SCENE`); below that, posters render centered and static. The zero-movies empty state ("No movies are scheduled right now — check back soon.") is unchanged.
- Both acts behave identically on desktop and mobile — no simplified mobile fallback.
- `prefers-reduced-motion: reduce` disables both acts' scroll-driven motion: the 3D model loads directly in its screen-facing pose (no scroll-linked rotation) and the poster section renders as a normal static layout.
- If the Sketchfab embed fails to load, the homepage must not break — act one degrades to a static dark panel with the title, and act two proceeds normally.
- All money/booking-flow code, the database schema, and every page other than the homepage, movie detail, and showtimes pages are out of scope.

---

### Task 1: Scroll-scene threshold helper

**Files:**
- Create: `lib/homepage/scroll-scene.ts`
- Test: `tests/unit/scroll-scene.test.ts`

**Interfaces:**
- Produces: `MIN_MOVIES_FOR_SCROLL_SCENE: number`, `usesScrollScene(movieCount: number): boolean` — Task 5 imports both to decide whether to build the pinned poster-scrub scaffold or render the static fallback.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scroll-scene.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { usesScrollScene, MIN_MOVIES_FOR_SCROLL_SCENE } from '../../lib/homepage/scroll-scene';

describe('usesScrollScene', () => {
  it('is false for zero movies', () => {
    expect(usesScrollScene(0)).toBe(false);
  });

  it('is false for exactly one movie', () => {
    expect(usesScrollScene(1)).toBe(false);
  });

  it('is true at the minimum threshold', () => {
    expect(usesScrollScene(MIN_MOVIES_FOR_SCROLL_SCENE)).toBe(true);
  });

  it('is true for many movies', () => {
    expect(usesScrollScene(10)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scroll-scene.test.ts`
Expected: FAIL — `lib/homepage/scroll-scene.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/homepage/scroll-scene.ts`:

```ts
// A pinned poster-scroll scene with only one poster in it would look broken
// rather than cinematic — there's nothing to slide. Below this threshold,
// the homepage renders the poster(s) centered and static instead.
export const MIN_MOVIES_FOR_SCROLL_SCENE = 2;

export function usesScrollScene(movieCount: number): boolean {
  return movieCount >= MIN_MOVIES_FOR_SCROLL_SCENE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scroll-scene.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/homepage/scroll-scene.ts tests/unit/scroll-scene.test.ts
git commit -m "feat: add scroll-scene movie-count threshold helper"
```

---

### Task 2: Camera pose interpolation helper

**Files:**
- Create: `lib/homepage/sketchfab-camera.ts`
- Test: `tests/unit/sketchfab-camera.test.ts`

**Interfaces:**
- Produces: `type CameraPose = { eye: [number, number, number]; target: [number, number, number] }`, `interpolateCamera(progress: number, from: CameraPose, to: CameraPose): CameraPose` — Task 6 calls this on every scroll update during the camera phase, feeding the result straight to the Sketchfab Viewer API's `setCameraLookAt(pose.eye, pose.target, duration)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sketchfab-camera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { interpolateCamera, type CameraPose } from '../../lib/homepage/sketchfab-camera';

const from: CameraPose = { eye: [0, 2, 10], target: [0, 1, 0] };
const to: CameraPose = { eye: [0, 6, -4], target: [0, 3, -10] };

describe('interpolateCamera', () => {
  it('returns the start pose at progress 0', () => {
    expect(interpolateCamera(0, from, to)).toEqual(from);
  });

  it('returns the end pose at progress 1', () => {
    expect(interpolateCamera(1, from, to)).toEqual(to);
  });

  it('returns the midpoint at progress 0.5', () => {
    expect(interpolateCamera(0.5, from, to)).toEqual({
      eye: [0, 4, 3],
      target: [0, 2, -5],
    });
  });

  it('clamps progress below 0', () => {
    expect(interpolateCamera(-2, from, to)).toEqual(from);
  });

  it('clamps progress above 1', () => {
    expect(interpolateCamera(5, from, to)).toEqual(to);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sketchfab-camera.test.ts`
Expected: FAIL — `lib/homepage/sketchfab-camera.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/homepage/sketchfab-camera.ts`:

```ts
export interface CameraPose {
  eye: [number, number, number];
  target: [number, number, number];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateCamera(progress: number, from: CameraPose, to: CameraPose): CameraPose {
  const t = Math.min(Math.max(progress, 0), 1);
  return {
    eye: [lerp(from.eye[0], to.eye[0], t), lerp(from.eye[1], to.eye[1], t), lerp(from.eye[2], to.eye[2], t)],
    target: [
      lerp(from.target[0], to.target[0], t),
      lerp(from.target[1], to.target[1], t),
      lerp(from.target[2], to.target[2], t),
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sketchfab-camera.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/homepage/sketchfab-camera.ts tests/unit/sketchfab-camera.test.ts
git commit -m "feat: add camera pose interpolation helper"
```

---

### Task 3: Booking CTA — movie detail page

**Files:**
- Modify: `app/movies/[id]/page.tsx`
- Test: `tests/e2e/movie-detail.spec.ts`

**Interfaces:**
- Consumes: `formatShowtime` (existing, `lib/format.ts`), `getShowtimesForMovie` (existing).
- No new exports — this task only changes rendered text and a test assertion.

Currently, `app/movies/[id]/page.tsx` renders each showtime as a bare formatted
time (e.g. "Wed, Aug 1, 6:00 PM") inside a link — nothing signals it's a
booking action.

- [ ] **Step 1: Add a failing E2E assertion**

In `tests/e2e/movie-detail.spec.ts`, add a new test inside the existing `describe` block (after the `'shows synopsis, director, cast, rating, and trailer link'` test):

```ts
  test('shows an explicit Book button for the showtime', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: new RegExp(FIXTURE_MOVIE.title) }).click();

    await expect(page.getByRole('link', { name: /^Book — / })).toBeVisible();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
set -a; source .env.local; set +a
npm run seed:fixture
npm run test:e2e -- tests/e2e/movie-detail.spec.ts
```

Expected: the new test FAILs — no link currently has an accessible name starting with "Book — ".

- [ ] **Step 3: Update the showtime chip's label**

In `app/movies/[id]/page.tsx`, change:

```tsx
        <ul className={styles.showtimeList}>
          {showtimes.map((showtime) => (
            <li key={showtime.id}>
              <Link href={`/book/${showtime.id}`} className={styles.showtimeChip}>
                {formatShowtime(showtime.startTime)}
              </Link>
            </li>
          ))}
        </ul>
```

to:

```tsx
        <ul className={styles.showtimeList}>
          {showtimes.map((showtime) => (
            <li key={showtime.id}>
              <Link href={`/book/${showtime.id}`} className={styles.showtimeChip}>
                Book — {formatShowtime(showtime.startTime)}
              </Link>
            </li>
          ))}
        </ul>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:e2e -- tests/e2e/movie-detail.spec.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/movies/[id]/page.tsx" tests/e2e/movie-detail.spec.ts
git commit -m "feat: label showtime links as explicit Book buttons on movie detail page"
```

---

### Task 4: Booking CTA — showtimes page

**Files:**
- Modify: `app/showtimes/page.tsx`
- Modify: `app/showtimes/page.module.css`
- Test: `tests/e2e/showtimes.spec.ts`

**Interfaces:**
- Consumes: `getAllShowtimes` (existing, returns `Array<Showtime & { movie: Movie }>`, so `showtime.id` and `showtime.movie.id` are both already available), `formatShowtime` (existing).

`/showtimes` currently renders each row's time as a plain `<span>` — not a
link at all, so there is no way to book directly from this page.

- [ ] **Step 1: Update the failing E2E assertion**

In `tests/e2e/showtimes.spec.ts`, replace the existing test body:

```ts
  test('lists the fixture movie with its formatted showtime', async ({ page }) => {
    await page.goto('/showtimes');
    await expect(page.getByRole('link', { name: FIXTURE_MOVIE.title })).toBeVisible();
    await expect(
      page.getByText(whitespaceAgnostic(formatShowtime(FIXTURE_SHOWTIME_START))),
    ).toBeVisible();
  });
```

with:

```ts
  test('lists the fixture movie with a Book link for its showtime', async ({ page }) => {
    await page.goto('/showtimes');
    await expect(page.getByRole('link', { name: FIXTURE_MOVIE.title })).toBeVisible();

    const bookLink = page.getByRole('link', { name: whitespaceAgnostic(`Book — ${formatShowtime(FIXTURE_SHOWTIME_START)}`) });
    await expect(bookLink).toBeVisible();
    await expect(bookLink).toHaveAttribute('href', /^\/book\/\d+$/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
set -a; source .env.local; set +a
npm run seed:fixture
npm run test:e2e -- tests/e2e/showtimes.spec.ts
```

Expected: FAIL — no link with that accessible name exists yet (the time is a plain `<span>`).

- [ ] **Step 3: Turn the time into a Book link**

In `app/showtimes/page.tsx`, change:

```tsx
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
```

to:

```tsx
        <ul className={styles.list}>
          {showtimes.map((showtime) => (
            <li key={showtime.id} className={styles.row}>
              <Link href={`/movies/${showtime.movie.id}`} className={styles.movieLink}>
                {showtime.movie.title}
              </Link>
              <Link href={`/book/${showtime.id}`} className={styles.bookLink}>
                Book — {formatShowtime(showtime.startTime)}
              </Link>
            </li>
          ))}
        </ul>
```

- [ ] **Step 4: Restyle `.time` as a link**

In `app/showtimes/page.module.css`, replace:

```css
.time {
  font-size: 0.85rem;
  color: var(--color-fg-muted);
  font-family: var(--font-body);
}
```

with:

```css
.bookLink {
  font-size: 0.85rem;
  font-family: var(--font-body);
  background: var(--color-accent-muted);
  color: var(--color-fg);
  padding: var(--space-xs) var(--space-sm);
  border-radius: 3px;
}
```

(This matches the `.showtimeChip` treatment already used on the movie detail page, so the same booking affordance looks consistent across both pages.)

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:e2e -- tests/e2e/showtimes.spec.ts
```

Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add app/showtimes/page.tsx app/showtimes/page.module.css tests/e2e/showtimes.spec.ts
git commit -m "feat: add Book links to the showtimes page"
```

---

### Task 5: `CinemaHome` skeleton — reduced motion, movie-count branching, combined ScrollTrigger scaffold

**Files:**
- Modify: `package.json` (add `gsap`)
- Create: `app/cinema-home.tsx`
- Create: `app/cinema-home.module.css`
- Modify: `app/page.tsx`
- Delete: `app/page.module.css` (superseded by `cinema-home.module.css` — nothing else imports it)

**Interfaces:**
- Consumes: `Movie` (`lib/types.ts`), `usesScrollScene`/`MIN_MOVIES_FOR_SCROLL_SCENE` (Task 1).
- Produces: `CinemaHome({ movies }: { movies: Movie[] })` — a Client Component. `app/page.tsx` renders it directly. Tasks 6 and 7 fill in this task's two placeholder phase-handler functions (`updateCameraPhase`, `updatePosterPhase`) with real behavior; this task establishes everything around them (mount lifecycle, reduced-motion gate, movie-count gate, the single ScrollTrigger's pin/scrub/progress-splitting) so Tasks 6 and 7 each have a stable seam to build into.

This task does not touch the Sketchfab embed or the poster track's visuals
yet — those are Tasks 6 and 7. It establishes the architecture: one
`ScrollTrigger`, pinned, spanning a scroll distance split into a "camera
phase" (the first `CAMERA_PHASE_FRACTION` of progress) and a "poster phase"
(the rest), only created when motion is wanted; otherwise a static fallback
renders.

- [ ] **Step 1: Install gsap**

```bash
npm install gsap
```

- [ ] **Step 2: Delete the now-unused grid stylesheet**

```bash
git rm app/page.module.css
```

- [ ] **Step 3: Write the component skeleton**

Create `app/cinema-home.module.css`:

```css
/* Break the homepage's <main> out of the site-wide centered, padded column
   (see app/globals.css's bare `main` rule) to go fully edge-to-edge — the
   scene needs the full viewport width, not a 960px reading column. */
.main {
  width: 100vw;
  max-width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  padding: 0;
}

.empty {
  padding: var(--space-xl) var(--space-lg);
  color: var(--color-fg-muted);
  text-align: center;
}

/* --- Motion scene: the .scene wrapper only matters when GSAP/ScrollTrigger
   pins .auditorium; for reduced motion, .auditorium renders on its own,
   full 100vh, as a plain static block. Same visual treatment either way —
   only whether it's pinned+scroll-driven differs. --- */
.scene {
  position: relative;
}

.auditorium {
  position: relative;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: var(--color-bg);
}

/* --- Static fallback: reduced motion, or fewer than
   MIN_MOVIES_FOR_SCROLL_SCENE movies --- */
.static {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-xl) var(--space-lg);
  background: var(--color-bg);
}

.staticGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-md);
  list-style: none;
  width: 100%;
  max-width: 960px;
}
```

Create `app/cinema-home.tsx`:

```tsx
'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Movie } from '@/lib/types';
import { usesScrollScene } from '@/lib/homepage/scroll-scene';
import styles from './cinema-home.module.css';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// The combined pinned scene's scroll progress (0..1) is split into two
// phases: the first CAMERA_PHASE_FRACTION rotates the 3D camera from the
// seats toward the screen (Task 6); the rest scrubs the poster track once
// the camera has settled (Task 7). 0.35 gives the camera turn a shorter
// "establishing" beat and the poster browsing — the actual point of the
// page — the majority of the scroll budget.
const CAMERA_PHASE_FRACTION = 0.35;

// Total scroll distance the pinned scene consumes, as a multiple of the
// viewport height. Tunable: shorter feels abrupt, longer feels sluggish.
const SCENE_HEIGHT_VH = 350;

// A textbook useSyncExternalStore case: subscribing to a mutable value that
// lives outside React (the OS-level motion preference via matchMedia). This
// also happens to be the only form eslint-plugin-react-hooks's
// react-hooks/set-state-in-effect rule accepts for this pattern — a plain
// useState+useEffect that calls setState synchronously in the effect body
// is flagged, since it causes an extra render pass right after mount.
function subscribeToReducedMotionChange(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false; // SSR has no OS preference to read; resolved on the client after hydration.
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToReducedMotionChange, getReducedMotionSnapshot, getReducedMotionServerSnapshot);
}

export function CinemaHome({ movies }: { movies: Movie[] }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  // False whenever reduced motion is preferred OR there are too few movies
  // to make a scroll-scrub meaningful — either way, the poster section
  // should render as a plain static grid instead (see `staticPosterGrid`
  // below). The 3D model is unaffected by movie count either way.
  const showPosterScrub = !prefersReducedMotion && usesScrollScene(movies.length);

  // Mirrored into a ref so Task 6's Sketchfab init effect can read the
  // current value without depending on it — depending on it directly would
  // re-run client.init() (creating a second embedded viewer) if the user's
  // OS-level motion preference changes after the model has already loaded,
  // instead of only affecting the one-time decision of where the camera
  // starts. The assignment lives in its own effect, not inline in the
  // component body — eslint-plugin-react-hooks's react-hooks/refs rule
  // forbids writing to a ref's `.current` during render; refs may only be
  // read or written inside effects/event handlers.
  const prefersReducedMotionRef = useRef(prefersReducedMotion);
  useEffect(() => {
    prefersReducedMotionRef.current = prefersReducedMotion;
  }, [prefersReducedMotion]);

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);

  // Placeholders filled in by Task 6 (camera) and Task 7 (posters). Keeping
  // them as no-ops here means this task's ScrollTrigger wiring is fully
  // testable in isolation (via manual scroll) before either phase has real
  // behavior. Declared here, before the effect that calls them, rather than
  // after — eslint-plugin-react-hooks's react-hooks/immutability rule
  // rejects a function used inside an effect before its own declaration,
  // even though plain JS function-hoisting would otherwise allow it.
  function updateCameraPhase(_progress: number): void {}
  function updatePosterPhase(_progress: number): void {}

  useEffect(() => {
    if (prefersReducedMotion || !sceneRef.current || !pinRef.current) {
      return;
    }

    const trigger = ScrollTrigger.create({
      trigger: sceneRef.current,
      start: 'top top',
      end: () => `+=${window.innerHeight * (SCENE_HEIGHT_VH / 100)}`,
      pin: pinRef.current,
      scrub: true,
      onUpdate: (self) => {
        if (self.progress <= CAMERA_PHASE_FRACTION) {
          const cameraProgress = self.progress / CAMERA_PHASE_FRACTION;
          updateCameraPhase(cameraProgress);
        } else {
          updateCameraPhase(1); // camera phase complete — hold the final pose
          if (showPosterScrub) {
            const posterProgress = (self.progress - CAMERA_PHASE_FRACTION) / (1 - CAMERA_PHASE_FRACTION);
            updatePosterPhase(posterProgress);
          }
        }
      },
    });

    return () => trigger.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-running on every movies/showPosterScrub change would tear down and rebuild the trigger mid-scroll; this effect intentionally only depends on prefersReducedMotion. updateCameraPhase/updatePosterPhase are also intentionally omitted — both only ever read from refs/constants, never from props or state, so which render's copy of them gets closed over here doesn't matter.
  }, [prefersReducedMotion]);

  if (movies.length === 0) {
    return (
      <main className={styles.main}>
        <h1>RetfenyMozi</h1>
        <p className={styles.empty}>No movies are scheduled right now — check back soon.</p>
      </main>
    );
  }

  // The scene/auditorium wrapper renders unconditionally, regardless of
  // prefersReducedMotion — ONLY whether the effect above actually creates a
  // ScrollTrigger for it varies. This is deliberate, not an oversight: an
  // earlier draft returned two structurally different trees (a flat
  // reduced-motion div vs. this nested scene/auditorium wrapper) gated on
  // prefersReducedMotion. useSyncExternalStore's SSR-safe hydration
  // contract means the first client render always uses the server
  // snapshot (false) regardless of the real value, so for a visitor who
  // actually prefers reduced motion, React briefly renders the pinned tree,
  // the ScrollTrigger effect fires and GSAP synchronously inserts its own
  // pin-spacer wrapper into the DOM (outside React's bookkeeping) — and
  // then, a moment later, React corrects to the real value and tries to
  // unmount that same subtree, calling removeChild on a node GSAP had
  // already re-parented. That's a real crash (`NotFoundError: Failed to
  // execute 'removeChild'...`), reproduced in both dev and a production
  // build. Keeping ONE tree shape always mounted means React never needs to
  // unmount anything out from under GSAP — the ScrollTrigger effect's own
  // `if (prefersReducedMotion || ...) return;` guard (above) is the only
  // thing that changes, and its cleanup (`trigger.kill()`) is GSAP's own
  // API for reversing its pin-spacer insertion, which runs synchronously
  // and safely before React's next commit.
  const auditorium = (
    <>{/* Task 6 fills this with the Sketchfab embed + title overlay + attribution. */}</>
  );

  // Whenever showPosterScrub is false (reduced motion OR too few movies to
  // scroll-scrub), render the plain static grid instead — this one IS safe
  // to render conditionally, since it's a sibling of the scene wrapper, not
  // something GSAP has touched.
  const staticPosterGrid = !showPosterScrub && (
    <div className={styles.static}>
      <ul className={styles.staticGrid}>
        {movies.map((movie) => (
          <li key={movie.id}>
            <Link href={`/movies/${movie.id}`}>
              <h2>{movie.title}</h2>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <main className={styles.main}>
      <div className={styles.scene} ref={sceneRef}>
        <div className={styles.auditorium} ref={pinRef}>
          {auditorium}
          {/* Task 7 fills this with the poster track + glow, as a sibling
              of {auditorium} within this same pinned div, rendered only
              when showPosterScrub is true. */}
        </div>
      </div>
      {staticPosterGrid}
    </main>
  );
}
```

- [ ] **Step 4: Wire it into the homepage**

Replace the full contents of `app/page.tsx`:

```tsx
import { getNowShowing } from '@/lib/db/queries';
import { CinemaHome } from './cinema-home';

// Render on every request. Without this, Next.js prerenders this page at build
// time and bakes the build-time database contents into static HTML, so
// re-seeding the database would have no effect until the next deploy.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const movies = await getNowShowing();
  return <CinemaHome movies={movies} />;
}
```

- [ ] **Step 5: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0. (The two placeholder-parameter functions use a `_progress` name specifically to satisfy `no-unused-vars` — keep that naming.)

- [ ] **Step 6: Manually verify in the browser**

```bash
set -a; source .env.local; set +a
npm run seed:fixture
npm run dev
```

Visit `http://localhost:3000/`. Expect: the page loads, shows a full-bleed
dark pinned section for roughly 3.5 viewport-heights of scrolling (currently
empty/black — that's expected, Tasks 6/7 fill it in), then releases into the
static fallback list below it (the fixture only seeds one movie, so
`showPosterScrub` is `false` here — this is the expected few-movies path).
No console errors.

Then, in your browser's DevTools, enable "Emulate CSS prefers-reduced-motion: reduce" **and reload the page with it already active** (not toggle it after the page has already loaded — that's the specific sequence that exposed a real GSAP/hydration crash during this task's own development: `NotFoundError: Failed to execute 'removeChild'...`, reproduced in both `next dev` and a production `next build && next start` run). Confirm the page loads with **no console errors at all** — that's the primary thing this check is for. Then confirm the visual result: still a full-bleed dark 100vh block (empty/black for now, same as above), but NOT pinned — scrolling past it should move it normally rather than holding it in place — followed directly by the same static list. No pin-spacer element left in the DOM once settled (GSAP's `ScrollTrigger.create()`/`.kill()` cycle should leave no trace once the effect has resolved to "reduced motion, don't pin").

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json app/cinema-home.tsx app/cinema-home.module.css app/page.tsx
git commit -m "feat: add CinemaHome scroll-scene skeleton with reduced-motion and movie-count fallbacks"
```

---

### Task 6: Act one — Sketchfab embed and scroll-driven camera

**Files:**
- Modify: `app/cinema-home.tsx`
- Modify: `app/cinema-home.module.css`

**Interfaces:**
- Consumes: `interpolateCamera`, `CameraPose` (Task 2); `updateCameraPhase` (Task 5's placeholder, replaced here).
- Produces: nothing new for later tasks — this task is self-contained within `CinemaHome`.

The Sketchfab Viewer API is loaded via their CDN script, not an npm
package, and works on a plain anonymous embed (confirmed against Sketchfab's
own documentation — no API token or paid tier required):
`https://static.sketchfab.com/api/sketchfab-viewer-<version>.js` exposes a
global `Sketchfab` constructor; `new Sketchfab(version, iframeElement)` then
`.init(modelUid, { success, error })` yields an `api` object whose
`setCameraLookAt(eye, target, duration, callback)` moves the camera.

**On the exact camera coordinates:** this specific model's own 3D coordinate
system can't be known without loading it — there's no way to predetermine
"the seats" and "the screen" as numeric vectors without looking at the
actual model. This task captures the model's own default/as-published
camera position programmatically (via `api.getCameraLookAt` right after it
loads) and uses that as `SEATS_VIEW` — guaranteed valid, since it's whatever
the model author set as the default framing. `SCREEN_VIEW` starts as a
documented best-guess offset from that (pulled back and turned to face
further into the scene) and must be tuned by hand in Step 6 below — this is
the one place in this plan where "run it and adjust a constant while
watching it" is the actual, correct engineering process, not a shortcut.

- [ ] **Step 1: Add the Sketchfab constants and camera-phase state**

In `app/cinema-home.tsx`, add `useState` to the existing React import (Task 5's `usePrefersReducedMotion` doesn't need it, but this task's `sketchfabFailed`/`scriptLoaded` state does):

```tsx
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
```

Then add these imports and constants near the top (after the existing imports, before `CAMERA_PHASE_FRACTION`):

```tsx
import Script from 'next/script';
import { interpolateCamera, type CameraPose } from '@/lib/homepage/sketchfab-camera';
```

```tsx
const SKETCHFAB_MODEL_UID = 'd680d16468f44cc1aefa90d0d996a26f';
const SKETCHFAB_VIEWER_SRC = 'https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js';
const SKETCHFAB_VIEWER_VERSION = '1.12.1';

// A short but non-zero duration so setCameraLookAt eases toward each new
// target rather than snapping — called on every scroll update, so it must
// stay short enough not to visibly lag behind the scroll position.
const CAMERA_MOVE_DURATION_S = 0.15;

// SEATS_VIEW is captured from the model's own default camera on load (see
// the `viewerready` handling below) — there's no way to know it up front.
// SCREEN_VIEW is a starting guess (pulled back and turned further into the
// scene from wherever SEATS_VIEW turns out to be) that must be tuned by
// hand: run `npm run dev`, scroll through act one, and adjust the numbers
// below until the camera actually ends up facing the screen. See Step 6.
const SCREEN_VIEW_OFFSET: CameraPose = { eye: [0, 1, -6], target: [0, 0, -14] };
```

Sketchfab's `sketchfab-viewer` script does not ship TypeScript types.
Declare a minimal ambient type for the bits this component uses — create
`lib/types/sketchfab.d.ts`:

```ts
export {};

declare global {
  interface SketchfabViewerApi {
    start: () => void;
    addEventListener: (event: string, callback: (...args: unknown[]) => void) => void;
    getCameraLookAt: (callback: (err: Error | null, camera: { position: [number, number, number]; target: [number, number, number] }) => void) => void;
    setCameraLookAt: (
      eye: [number, number, number],
      target: [number, number, number],
      duration: number,
      callback?: (err: Error | null) => void,
    ) => void;
  }

  interface Window {
    Sketchfab?: new (
      version: string,
      iframe: HTMLIFrameElement,
    ) => {
      init: (
        uid: string,
        options: { success: (api: SketchfabViewerApi) => void; error: () => void },
      ) => void;
    };
  }
}
```

- [ ] **Step 2: Add camera-phase refs and the Sketchfab init effect**

Inside the `CinemaHome` function, after the existing `pinRef` declaration, add:

```tsx
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sketchfabApiRef = useRef<SketchfabViewerApi | null>(null);
  const seatsViewRef = useRef<CameraPose | null>(null);
  const [sketchfabFailed, setSketchfabFailed] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const settledAtScreenRef = useRef(false);

  useEffect(() => {
    if (!scriptLoaded || !iframeRef.current || !window.Sketchfab) {
      return;
    }

    const client = new window.Sketchfab(SKETCHFAB_VIEWER_VERSION, iframeRef.current);
    client.init(SKETCHFAB_MODEL_UID, {
      success: (api) => {
        sketchfabApiRef.current = api;
        api.start();
        api.addEventListener('viewerready', () => {
          api.getCameraLookAt((err, camera) => {
            if (err) {
              setSketchfabFailed(true);
              return;
            }
            const seatsView: CameraPose = { eye: camera.position, target: camera.target };
            seatsViewRef.current = seatsView;

            if (prefersReducedMotionRef.current) {
              const screenView = addCameraOffset(seatsView, SCREEN_VIEW_OFFSET);
              api.setCameraLookAt(screenView.eye, screenView.target, 0);
            }
          });
        });
      },
      error: () => setSketchfabFailed(true),
    });
    // prefersReducedMotion is read via prefersReducedMotionRef (see above)
    // specifically so this effect does not depend on it — see that ref's
    // comment for why.
  }, [scriptLoaded]);
```

- [ ] **Step 3: Add the camera-offset helper**

Add near the top of `app/cinema-home.tsx`, alongside the other module-scope constants:

```tsx
function addCameraOffset(base: CameraPose, offset: CameraPose): CameraPose {
  return {
    eye: [base.eye[0] + offset.eye[0], base.eye[1] + offset.eye[1], base.eye[2] + offset.eye[2]],
    target: [base.target[0] + offset.target[0], base.target[1] + offset.target[1], base.target[2] + offset.target[2]],
  };
}
```

- [ ] **Step 4: Implement `updateCameraPhase`**

Replace the Task 5 placeholder:

```tsx
  function updateCameraPhase(_progress: number): void {}
```

with:

```tsx
  function updateCameraPhase(progress: number): void {
    const api = sketchfabApiRef.current;
    const seatsView = seatsViewRef.current;
    if (!api || !seatsView) {
      return;
    }

    if (progress >= 1) {
      if (!settledAtScreenRef.current) {
        const screenView = addCameraOffset(seatsView, SCREEN_VIEW_OFFSET);
        api.setCameraLookAt(screenView.eye, screenView.target, CAMERA_MOVE_DURATION_S);
        settledAtScreenRef.current = true;
      }
      return;
    }

    settledAtScreenRef.current = false;
    const screenView = addCameraOffset(seatsView, SCREEN_VIEW_OFFSET);
    const pose = interpolateCamera(progress, seatsView, screenView);
    api.setCameraLookAt(pose.eye, pose.target, CAMERA_MOVE_DURATION_S);
  }
```

(The `settledAtScreenRef` guard is what satisfies the spec's "does not
resume moving after this point" — once at progress 1, the camera is set
once, not on every subsequent scroll tick.)

- [ ] **Step 5: Render the embed, title overlay, attribution, and error fallback**

Replace the `auditorium` placeholder from Task 5 (currently `<>{/* Task 6 fills this... */}</>`, rendered as a child of `.auditorium` in both the reduced-motion and pinned branches) with:

```tsx
  const auditorium = sketchfabFailed ? (
    <div className={styles.sketchfabFallback}>
      <h1 className={styles.title}>RetfenyMozi</h1>
    </div>
  ) : (
    <>
      <Script
        src={SKETCHFAB_VIEWER_SRC}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setSketchfabFailed(true)}
      />
      <iframe
        ref={iframeRef}
        title="RetfenyMozi auditorium"
        className={styles.sketchfabFrame}
        allow="autoplay; fullscreen; xr-spatial-tracking"
      />
      <h1 className={styles.title}>RetfenyMozi</h1>
      <p className={styles.attribution}>
        <a
          href="https://sketchfab.com/3d-models/vr-cinema-d680d16468f44cc1aefa90d0d996a26f"
          target="_blank"
          rel="noreferrer"
        >
          VR Cinema
        </a>{' '}
        by{' '}
        <a href="https://sketchfab.com/LeandroN" target="_blank" rel="noreferrer">
          Leandro Nicolas
        </a>{' '}
        on{' '}
        <a href="https://sketchfab.com" target="_blank" rel="noreferrer">
          Sketchfab
        </a>
      </p>
    </>
  );
```

This constant is used unchanged by both `return` branches Task 5 already
wrote (the reduced-motion static wrapper and the pinned wrapper) — nothing
else in the component's JSX needs to change for this step.

- [ ] **Step 6: Add the supporting CSS**

Add to `app/cinema-home.module.css`:

```css
.sketchfabFrame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  z-index: 0;
  pointer-events: none; /* the camera is scroll-driven only — no drag/orbit/zoom exposed to the visitor */
}

.sketchfabFallback {
  position: absolute;
  inset: 0;
  background: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.title {
  position: relative;
  z-index: 1;
  color: var(--color-fg);
  text-align: center;
  text-shadow: 0 0 40px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.attribution {
  position: absolute;
  z-index: 1;
  bottom: var(--space-sm);
  right: var(--space-sm);
  font-size: 0.7rem;
  color: var(--color-fg-muted);
  background: rgba(var(--color-scrim-rgb), 0.6);
  padding: 2px 8px;
  border-radius: 3px;
}

.attribution a {
  color: var(--color-fg-muted);
  text-decoration: underline;
}
```

- [ ] **Step 7: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 8: Manually verify and tune the camera in the browser**

```bash
set -a; source .env.local; set +a
npm run dev
```

Visit `http://localhost:3000/` (with real content — run `npm run seed:fixture`
first if the DB is empty, or seed a second movie so the poster path is also
visible later in Task 7's verification). Confirm: the 3D model loads,
"RetfenyMozi" and the Sketchfab attribution are visible over it, dragging on
the model does nothing (no orbit/zoom — the `pointer-events: none` on the
iframe blocks it), and scrolling through the first ~35% of the pinned
section's height visibly rotates the camera. **Adjust `SCREEN_VIEW_OFFSET`'s
numbers and re-check** until the end state actually looks like it's facing
a screen/wall rather than an arbitrary angle — this is expected, iterative
tuning, not a bug.

Then re-check the `prefers-reduced-motion: reduce` DevTools emulation from
Task 5's verification: the model should now load and immediately show the
tuned screen-facing pose, with no scroll-linked rotation.

Also verify the error path: temporarily change `SKETCHFAB_MODEL_UID` to an
invalid string, reload, confirm the dark fallback panel with just the title
renders instead of a broken/blank embed, then revert the change.

- [ ] **Step 9: Commit**

```bash
git add app/cinema-home.tsx app/cinema-home.module.css lib/types/sketchfab.d.ts
git commit -m "feat: add Sketchfab embed with scroll-driven camera for act one"
```

---

### Task 7: Act two — poster track, glow, and scroll-scrub

**Files:**
- Modify: `app/cinema-home.tsx`
- Modify: `app/cinema-home.module.css`

**Interfaces:**
- Consumes: `Movie[]` (already in scope), `updatePosterPhase` (Task 5's placeholder, replaced here), `showPosterScrub` (already in scope from Task 5).
- Produces: nothing new for later tasks.

This reuses the poster-track structure validated in the brainstorming
prototype (glow behind a horizontal row of posters), translated into the
project's real design tokens and wired to the combined ScrollTrigger's
poster-phase progress instead of its own separate one.

- [ ] **Step 1: Add the poster track ref and glow markup**

In `app/cinema-home.tsx`'s pinned-branch `return` (the second `return`, with
`<div className={styles.auditorium} ref={pinRef}>`), add this directly
after `{auditorium}` inside that div — as a sibling, not inside the shared
`auditorium` constant itself, since posters must never render in the
reduced-motion static auditorium (that path uses `staticPosterGrid`
instead):

```tsx
          {showPosterScrub && (
            <div className={styles.glow} aria-hidden="true" />
          )}
          {showPosterScrub && (
            <div className={styles.track} ref={trackRef}>
              {movies.map((movie) => (
                <Link key={movie.id} href={`/movies/${movie.id}`} className={styles.poster}>
                  {movie.posterUrl ? (
                    <img src={movie.posterUrl} alt={`${movie.title} poster`} className={styles.posterImage} />
                  ) : (
                    <img
                      src="/placeholder-poster.svg"
                      alt={`${movie.title} poster placeholder`}
                      className={styles.posterImage}
                    />
                  )}
                  <h2 className={styles.posterTitle}>{movie.title}</h2>
                </Link>
              ))}
            </div>
          )}
```

- [ ] **Step 2: Add the `trackRef` and implement `updatePosterPhase`**

Add the ref alongside the other refs in `CinemaHome`:

```tsx
  const trackRef = useRef<HTMLDivElement | null>(null);
```

Replace the Task 5 placeholder:

```tsx
  function updatePosterPhase(_progress: number): void {}
```

with:

```tsx
  function updatePosterPhase(progress: number): void {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const maxTranslate = Math.max(track.scrollWidth - window.innerWidth + 160, 0);
    gsap.set(track, { x: -progress * maxTranslate });
  }
```

- [ ] **Step 3: Add the poster-track and glow CSS**

Add to `app/cinema-home.module.css`:

```css
.glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(ellipse 55% 42% at 50% 62%, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.06) 45%, transparent 72%);
  pointer-events: none;
}

.track {
  position: absolute;
  z-index: 2;
  bottom: 8vh;
  left: 0;
  display: flex;
  gap: var(--space-lg);
  padding: 0 8vw;
  will-change: transform;
}

.poster {
  flex: 0 0 auto;
  width: 190px;
  aspect-ratio: 2 / 3;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  background: var(--color-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
}

.posterImage {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.posterTitle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding: var(--space-sm);
  font-size: 1rem;
  color: var(--color-fg);
  background: linear-gradient(to top, var(--color-scrim), rgba(var(--color-scrim-rgb), 0) 80%);
}
```

- [ ] **Step 4: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 5: Manually verify in the browser**

```bash
set -a; source .env.local; set +a
npm run dev
```

You need at least 2 movies in the database to see this path (`showPosterScrub`
requires `usesScrollScene`, i.e. `MIN_MOVIES_FOR_SCROLL_SCENE = 2`). If your
seeded DB only has the one fixture movie, insert a second one manually (via
`npm run seed` with real TMDB/OMDb credentials, or a second call to
`seedFixture`-style insert) for this check, then visit `http://localhost:3000/`.

Confirm: scrolling past the ~35% mark where act one's camera settles reveals
the poster track sliding horizontally in sync with continued scrolling,
with the white glow behind it; each poster is a working link to its
`/movies/[id]` page; the last poster fully clears the right edge by the time
the pinned section releases (no dead scroll space, no posters cut off
un-reachable).

Then re-verify the single-movie (few-movies) case still renders the static
fallback list below act one, exactly as confirmed in Task 5 — this task
should not have changed that path.

- [ ] **Step 6: Commit**

```bash
git add app/cinema-home.tsx app/cinema-home.module.css
git commit -m "feat: add poster track scroll-scrub for act two"
```

---

### Task 8: E2E coverage for the new homepage, and full regression

**Files:**
- Modify: `tests/e2e/browse-movies.spec.ts`
- Create: `tests/e2e/cinema-scroll-scene.spec.ts`

**Interfaces:**
- Consumes: `seedFixture`, `FIXTURE_MOVIE` (existing, `scripts/seed-fixture.ts`); `movies`, `showtimes` (`lib/db/schema.ts`); `createDb` (`lib/db/client.ts`).

`browse-movies.spec.ts`'s existing assertions (a heading with the movie's
title is visible; clicking it navigates to the detail page) still hold
under the new markup, since Task 5/7 kept each poster's title as an `<h2>`
and each poster as a real link — but this task adds a dedicated check for
the multi-movie scroll-scene path, which the shared single-movie fixture
never exercises.

- [ ] **Step 1: Confirm the existing browse-movies assertions still pass**

```bash
set -a; source .env.local; set +a
npm run seed:fixture
npm run test:e2e -- tests/e2e/browse-movies.spec.ts
```

Expected: PASS (2 tests), unchanged from before this plan — if either fails,
the poster markup in Task 7 (or the static fallback in Task 5) dropped the
`<h2>` title or broke the link; fix that before continuing.

- [ ] **Step 2: Write the new scroll-scene test**

Create `tests/e2e/cinema-scroll-scene.spec.ts`:

```ts
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
```

- [ ] **Step 3: Run the new test**

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
npm run test:e2e -- tests/e2e/cinema-scroll-scene.spec.ts
```

Expected: PASS (1 test). If the poster links aren't attached after the
scroll, increase the `page.mouse.wheel` delta (the pinned scene's total
height is `SCENE_HEIGHT_VH` viewport-heights, defined in `app/cinema-home.tsx`)
rather than weakening the assertion.

- [ ] **Step 4: Re-seed the single-movie fixture and run the full regression suite**

```bash
npm run seed:fixture
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
```

Expected: lint 0 errors, typecheck clean, unit and integration suites fully
green, and every E2E spec passes — `browse-movies`, `movie-detail`,
`showtimes`, `cinema-scroll-scene` (this task), and the pre-existing
`booking` spec (still expected to fail only on the documented dummy-Stripe-key
limitation from the booking system plan, unrelated to this work — confirm
that's the only failure, if any).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/browse-movies.spec.ts tests/e2e/cinema-scroll-scene.spec.ts
git commit -m "test: add E2E coverage for the multi-movie cinema scroll scene"
```

---

## Self-Review Notes

- **Spec coverage:** Two-act architecture and handoff → Tasks 5-7. Sketchfab
  attribution requirement → Task 6 Step 5. Content-length edge case
  (< 2 movies → static fallback) → Task 1 (threshold) + Task 5 (branching).
  Reduced-motion fallback → Task 5 (gate) + Task 6 Step 2 (fixed pose on
  load) + both tasks' manual verification steps. Mobile parity → no
  device-specific branching exists anywhere in Tasks 5-7, satisfying "same
  experience on both" by simply not special-casing it. Sketchfab
  load-failure fallback → Task 6 Steps 2 and 5. Booking CTAs on movie detail
  and showtimes pages → Tasks 3 and 4. Testing philosophy (E2E confirms
  content is present/reachable, not pixel-perfect animation) → Task 8's
  `toBeAttached()` (not exact-position) assertions.
- **Type consistency checked:** `CameraPose` (Task 2) is the exact shape
  `interpolateCamera` returns and `addCameraOffset`/`updateCameraPhase`
  (Task 6) consume — traced field-by-field (`eye`/`target`, both 3-tuples).
  `usesScrollScene`/`MIN_MOVIES_FOR_SCROLL_SCENE` (Task 1) are consumed by
  name, unchanged, in Task 5. `Movie` (existing `lib/types.ts`) is passed
  through unchanged from `app/page.tsx` to `CinemaHome` to the poster
  `.map()` in Task 7 — same fields (`id`, `title`, `posterUrl`) used
  throughout, matching the original grid's usage.
- **No placeholders:** every step has literal file contents or literal
  commands. The one deliberate exception — `SCREEN_VIEW_OFFSET`'s starting
  numbers in Task 6 — is flagged explicitly as needing empirical tuning
  against the real model in a real browser, with the exact verification
  procedure to arrive at a correct value, not an unwritten implementation
  detail.
- **Bug caught and fixed during this review:** Task 5's first draft gated
  the 3D model's rendering itself on `prefersReducedMotion`, so reduced-
  motion visitors would have seen no auditorium at all — but the spec
  requires the model still render, in a fixed screen-facing pose, with only
  the scroll-linked *rotation* removed. Restructured so the Sketchfab embed
  (`auditorium`) is one shared JSX value rendered by both the pinned and the
  reduced-motion branches, with only the wrapping (pinned+scroll-driven vs.
  static) differing — Tasks 6 and 7 were both updated to match. A second,
  smaller issue from the same draft — the Task 6 Sketchfab-init effect
  depending on `prefersReducedMotion` directly, which would have
  re-initialized (duplicated) the embed if the OS motion preference changed
  mid-session — was fixed by mirroring it into a ref instead.
