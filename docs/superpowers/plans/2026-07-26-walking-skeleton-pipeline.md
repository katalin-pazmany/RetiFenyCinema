# RetfenyMozi Walking Skeleton & CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public RetfenyMozi cinema site (movie listings with full metadata, showtimes, about/contact) backed by Postgres, deployed through a real CI/CD pipeline with automated testing, environment promotion (preview → staging → production), and infrastructure as code.

**Architecture:** Next.js (App Router, TypeScript) on Vercel, reading from a Postgres database (Neon) via Drizzle ORM. Movie metadata (synopsis, poster, director, cast, trailer, IMDb ID) is fetched from TMDB and the IMDb rating from OMDb, both via a versioned seed script — there is no admin UI in this sub-project. GitHub Actions runs lint/typecheck/tests on every PR, deploys an ephemeral preview per PR (backed by its own ephemeral Neon branch) for Playwright E2E testing, auto-promotes tested code to a staging environment on merge to `main`, and promotes staging to production only via an explicit manual workflow. Terraform declares the Vercel project and the Neon project/branches.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Drizzle ORM, `@neondatabase/serverless`, Vitest, Playwright, GitHub Actions, Vercel CLI, Terraform (`vercel` and `kislerdm/neon` providers), TMDB API, OMDb API.

## Global Constraints

- Framework: Next.js App Router, deployed on Vercel. (spec: Architecture)
- Database: Postgres via Neon. (spec: Architecture)
- No admin UI in this sub-project — movies/showtimes are managed via versioned seed/migration scripts checked into the repo. (spec: Architecture, Out of Scope)
- No booking/payments, no Resend transactional email, no Mixpanel analytics in this sub-project. (spec: Out of Scope)
- TMDB API failure must fall back to last-cached movie data and a placeholder poster — the page must never fail to render. (spec: Error Handling)
- OMDb API failure must omit the IMDb rating only; the rest of the movie's data still displays. (spec: Error Handling)
- Migration failure must fail the pipeline fast and block promotion — the app is never deployed against an unmigrated schema. (spec: CI/CD Pipeline, Error Handling)
- Production promotion is an explicit manual step (`workflow_dispatch`), never automatic. (spec: CI/CD Pipeline)
- `Showtime` has no room field — the cinema has exactly one screen. (spec: Data Model)
- CI/CD runs on GitHub Actions; infrastructure is declared in Terraform (Vercel project + Neon project/branches). (spec: CI/CD Pipeline, Infrastructure as Code)

---

## File Structure

```
RetfenyMozi/
  app/
    layout.tsx                  # Root layout, global nav
    page.tsx                    # Home — now showing
    globals.css
    movies/[id]/page.tsx        # Movie detail
    showtimes/page.tsx          # Showtimes list
    about/page.tsx              # About / contact
  lib/
    types.ts                    # Movie, Showtime, MovieMetadata domain types
    format.ts                   # formatShowtime()
    db/
      schema.ts                 # Drizzle table definitions
      client.ts                 # createDb(), default db instance
      queries.ts                # getNowShowing, getMovieById, getShowtimesForMovie, getAllShowtimes
    external/
      tmdb.ts                   # mapTmdbToMovie, fetchTmdbMovie
      omdb.ts                   # parseImdbRating, fetchImdbRating
  scripts/
    migrate.ts                  # applies Drizzle migrations to a given DATABASE_URL
    seed-movie.ts                # fetches TMDB+OMDb, upserts a real movie + showtimes
    seed-fixture.ts              # inserts a known fixture movie/showtime, no external calls (used by E2E)
  drizzle/                      # generated SQL migrations (drizzle-kit output)
  drizzle.config.ts
  tests/
    unit/
      format.test.ts
      tmdb.test.ts
      omdb.test.ts
    integration/
      queries.test.ts
      seed-movie.test.ts
    e2e/
      browse-movies.spec.ts
      showtimes.spec.ts
      movie-detail.spec.ts
  docker-compose.yml             # local Postgres
  docker/init-test-db.sql        # creates the local test database
  .github/workflows/
    pr.yml
    main.yml
    promote.yml
    pr-cleanup.yml
  infra/
    main.tf
    variables.tf
    vercel.tf
    neon.tf
  .env.example
  README.md
  playwright.config.ts
  vitest.config.ts
  package.json
  tsconfig.json
```

---

### Task 1: Scaffold the Next.js project and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.eslintrc` (or `eslint.config.mjs`, whatever `create-next-app` generates), `.gitignore`
- Create: `vitest.config.ts`
- Create: `tests/unit/smoke.test.ts`

**Interfaces:**
- Produces: `npm run lint`, `npm run typecheck`, `npm run test:unit` — every later task assumes these three commands exist and exit non-zero on failure.

- [ ] **Step 1: Scaffold with create-next-app**

```bash
npx --yes create-next-app@latest . --typescript --eslint --app --no-src-dir --import-alias "@/*" --no-tailwind --use-npm
```

Answer any remaining prompts: no to Turbopack customization beyond defaults is fine.

- [ ] **Step 2: Add typecheck script**

Edit `package.json`, in `"scripts"` add:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Install Vitest**

```bash
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 4: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

Add to `package.json` `"scripts"`:

```json
"test:unit": "vitest run tests/unit",
"test:integration": "vitest run tests/integration"
```

- [ ] **Step 5: Write a smoke test**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('project scaffold', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Verify lint, typecheck, and unit test all pass**

Run: `npm run lint && npm run typecheck && npm run test:unit`
Expected: all three exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with lint, typecheck, and Vitest"
```

---

### Task 2: CI pipeline skeleton (lint, typecheck, unit tests)

**Files:**
- Create: `.github/workflows/pr.yml`

**Interfaces:**
- Consumes: `npm run lint`, `npm run typecheck`, `npm run test:unit` (Task 1)
- Produces: `.github/workflows/pr.yml` job named `test` — Task 8 and Task 17 extend this same job/workflow.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/pr.yml`:

```yaml
name: PR Checks

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit
```

- [ ] **Step 2: Validate the YAML**

Run: `npx -y js-yaml .github/workflows/pr.yml`
Expected: prints the parsed document with no error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pr.yml
git commit -m "ci: add PR pipeline skeleton (lint, typecheck, unit tests)"
```

---

### Task 3: Local Postgres, Drizzle schema, and migration tooling

**Files:**
- Create: `docker-compose.yml`, `docker/init-test-db.sql`, `.env.example`
- Create: `lib/db/schema.ts`, `lib/db/client.ts`
- Create: `drizzle.config.ts`, `scripts/migrate.ts`
- Create: `drizzle/` (generated by drizzle-kit)

**Interfaces:**
- Produces:
  - `movies` table: `id, tmdb_id, imdb_id, title, synopsis, poster_url, runtime, director, actors (text[]), imdb_rating (numeric), trailer_url, created_at`
  - `showtimes` table: `id, movie_id (FK -> movies.id), start_time`
  - `lib/db/client.ts`: `createDb(connectionString: string)`, `db` (default instance from `DATABASE_URL`)
  - `scripts/migrate.ts`: CLI, `tsx scripts/migrate.ts [connectionString]`, applies `./drizzle/*.sql` to the given (or `DATABASE_URL`) database.

- [ ] **Step 1: Install DB dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit tsx
```

- [ ] **Step 2: Add Docker Compose for local Postgres**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: retfenymozi
      POSTGRES_PASSWORD: retfenymozi
      POSTGRES_DB: retfenymozi
    ports:
      - '5432:5432'
    volumes:
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql
      - retfenymozi-db-data:/var/lib/postgresql/data

volumes:
  retfenymozi-db-data:
```

Create `docker/init-test-db.sql`:

```sql
CREATE DATABASE retfenymozi_test;
```

- [ ] **Step 3: Add env example**

Create `.env.example`:

```
DATABASE_URL=postgres://retfenymozi:retfenymozi@localhost:5432/retfenymozi
TEST_DATABASE_URL=postgres://retfenymozi:retfenymozi@localhost:5432/retfenymozi_test
TMDB_API_KEY=
OMDB_API_KEY=
```

- [ ] **Step 4: Start local Postgres**

```bash
docker compose up -d db
cp .env.example .env.local
```

- [ ] **Step 5: Write the Drizzle schema**

Create `lib/db/schema.ts`:

```ts
import { pgTable, serial, integer, text, numeric, timestamp } from 'drizzle-orm/pg-core';

export const movies = pgTable('movies', {
  id: serial('id').primaryKey(),
  tmdbId: integer('tmdb_id').notNull().unique(),
  imdbId: text('imdb_id'),
  title: text('title').notNull(),
  synopsis: text('synopsis').notNull(),
  posterUrl: text('poster_url'),
  runtime: integer('runtime'),
  director: text('director'),
  actors: text('actors').array().notNull().default([]),
  imdbRating: numeric('imdb_rating', { precision: 3, scale: 1 }),
  trailerUrl: text('trailer_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const showtimes = pgTable('showtimes', {
  id: serial('id').primaryKey(),
  movieId: integer('movie_id')
    .notNull()
    .references(() => movies.id),
  startTime: timestamp('start_time').notNull(),
});
```

- [ ] **Step 6: Write the DB client**

Create `lib/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export const db = createDb(process.env.DATABASE_URL!);
```

- [ ] **Step 7: Configure drizzle-kit**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

Add to `package.json` `"scripts"`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx scripts/migrate.ts"
```

- [ ] **Step 8: Write the migration runner script**

Create `scripts/migrate.ts`:

```ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { migrate } from 'drizzle-orm/neon-http/migrator';

async function main() {
  const connectionString = process.argv[2] ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Usage: npx tsx scripts/migrate.ts [connectionString]  (or set DATABASE_URL)');
    process.exit(1);
  }
  const sql = neon(connectionString);
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 9: Generate and apply the initial migration to both local databases**

```bash
source .env.local
npm run db:generate
npm run db:migrate -- "$DATABASE_URL"
npm run db:migrate -- "$TEST_DATABASE_URL"
```

Expected: `drizzle/0000_*.sql` is created, and both commands print `Migrations applied`.

- [ ] **Step 10: Verify tables exist**

```bash
docker compose exec db psql -U retfenymozi -d retfenymozi -c '\dt'
```

Expected: lists `movies` and `showtimes`.

- [ ] **Step 11: Commit**

```bash
git add docker-compose.yml docker/ .env.example lib/db/ drizzle.config.ts drizzle/ scripts/migrate.ts package.json package-lock.json
git commit -m "feat: add Postgres schema, Drizzle client, and migration tooling"
```

---

### Task 4: Showtime formatting utility

**Files:**
- Create: `lib/format.ts`
- Test: `tests/unit/format.test.ts`

**Interfaces:**
- Produces: `formatShowtime(date: Date): string` — used by the showtimes page (Task 12) and movie detail page (Task 11).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatShowtime } from '../../lib/format';

describe('formatShowtime', () => {
  it('formats a UTC instant in the cinema local time zone', () => {
    const date = new Date('2026-08-01T18:00:00Z');
    expect(formatShowtime(date)).toBe('Sat, Aug 1, 8:00 PM');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/format.test.ts`
Expected: FAIL — `lib/format.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/format.ts`:

```ts
export function formatShowtime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Budapest',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts tests/unit/format.test.ts
git commit -m "feat: add formatShowtime utility"
```

---

### Task 5: TMDB client

**Files:**
- Create: `lib/external/tmdb.ts`
- Test: `tests/unit/tmdb.test.ts`

**Interfaces:**
- Produces:
  - `MovieMetadata` type (also exported from `lib/types.ts`, see Step 1): `{ tmdbId: number; imdbId: string | null; title: string; synopsis: string; posterUrl: string | null; runtime: number | null; director: string | null; actors: string[]; trailerUrl: string | null }`
  - `mapTmdbToMovie(raw: TmdbMovieResponse): MovieMetadata` (pure)
  - `fetchTmdbMovie(tmdbId: number, apiKey: string): Promise<MovieMetadata>` (calls TMDB, throws on non-OK response)
- Consumes: none

- [ ] **Step 1: Add the shared domain types**

Create `lib/types.ts`:

```ts
export interface MovieMetadata {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  synopsis: string;
  posterUrl: string | null;
  runtime: number | null;
  director: string | null;
  actors: string[];
  trailerUrl: string | null;
}

export interface Movie extends MovieMetadata {
  id: number;
  imdbRating: number | null;
}

export interface Showtime {
  id: number;
  movieId: number;
  startTime: Date;
}
```

- [ ] **Step 2: Write the failing test for the pure mapper**

Create `tests/unit/tmdb.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapTmdbToMovie, fetchTmdbMovie, type TmdbMovieResponse } from '../../lib/external/tmdb';

const fixture: TmdbMovieResponse = {
  id: 27205,
  title: 'Inception',
  overview: 'A thief who steals corporate secrets through dream-sharing technology.',
  poster_path: '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
  runtime: 148,
  credits: {
    cast: [
      { name: 'Leonardo DiCaprio', order: 0 },
      { name: 'Joseph Gordon-Levitt', order: 1 },
      { name: 'Elliot Page', order: 2 },
      { name: 'Tom Hardy', order: 3 },
      { name: 'Ken Watanabe', order: 4 },
      { name: 'Cillian Murphy', order: 5 },
    ],
    crew: [
      { name: 'Christopher Nolan', job: 'Director' },
      { name: 'Emma Thomas', job: 'Producer' },
    ],
  },
  videos: {
    results: [
      { site: 'YouTube', type: 'Teaser', key: 'teaser-key' },
      { site: 'YouTube', type: 'Trailer', key: 'trailer-key' },
    ],
  },
  external_ids: { imdb_id: 'tt1375666' },
};

describe('mapTmdbToMovie', () => {
  it('maps a TMDB response to MovieMetadata', () => {
    expect(mapTmdbToMovie(fixture)).toEqual({
      tmdbId: 27205,
      imdbId: 'tt1375666',
      title: 'Inception',
      synopsis: 'A thief who steals corporate secrets through dream-sharing technology.',
      posterUrl: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
      runtime: 148,
      director: 'Christopher Nolan',
      actors: [
        'Leonardo DiCaprio',
        'Joseph Gordon-Levitt',
        'Elliot Page',
        'Tom Hardy',
        'Ken Watanabe',
      ],
      trailerUrl: 'https://www.youtube.com/watch?v=trailer-key',
    });
  });

  it('handles missing poster, director, and trailer', () => {
    const sparse: TmdbMovieResponse = {
      id: 1,
      title: 'Untitled',
      overview: 'No synopsis yet.',
      poster_path: null,
      runtime: null,
      credits: { cast: [], crew: [] },
      videos: { results: [] },
      external_ids: { imdb_id: null },
    };
    const result = mapTmdbToMovie(sparse);
    expect(result.posterUrl).toBeNull();
    expect(result.director).toBeNull();
    expect(result.trailerUrl).toBeNull();
    expect(result.actors).toEqual([]);
  });
});

describe('fetchTmdbMovie', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and maps a movie by TMDB id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fixture),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchTmdbMovie(27205, 'test-key');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/movie/27205?api_key=test-key&append_to_response=credits,videos,external_ids',
    );
    expect(result.title).toBe('Inception');
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchTmdbMovie(999, 'test-key')).rejects.toThrow('TMDB request failed with status 404');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/tmdb.test.ts`
Expected: FAIL — `lib/external/tmdb.ts` does not exist.

- [ ] **Step 4: Write the implementation**

Create `lib/external/tmdb.ts`:

```ts
import type { MovieMetadata } from '../types';

export interface TmdbMovieResponse {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  runtime: number | null;
  credits: {
    cast: Array<{ name: string; order: number }>;
    crew: Array<{ name: string; job: string }>;
  };
  videos: {
    results: Array<{ site: string; type: string; key: string }>;
  };
  external_ids: {
    imdb_id: string | null;
  };
}

export function mapTmdbToMovie(raw: TmdbMovieResponse): MovieMetadata {
  const director = raw.credits.crew.find((c) => c.job === 'Director')?.name ?? null;
  const actors = [...raw.credits.cast].sort((a, b) => a.order - b.order).slice(0, 5).map((c) => c.name);
  const trailer = raw.videos.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer');

  return {
    tmdbId: raw.id,
    imdbId: raw.external_ids.imdb_id,
    title: raw.title,
    synopsis: raw.overview,
    posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : null,
    runtime: raw.runtime,
    director,
    actors,
    trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
  };
}

export async function fetchTmdbMovie(tmdbId: number, apiKey: string): Promise<MovieMetadata> {
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits,videos,external_ids`,
  );
  if (!res.ok) {
    throw new Error(`TMDB request failed with status ${res.status}`);
  }
  const raw = (await res.json()) as TmdbMovieResponse;
  return mapTmdbToMovie(raw);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/tmdb.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/external/tmdb.ts tests/unit/tmdb.test.ts
git commit -m "feat: add TMDB client with credits, videos, and external ids"
```

---

### Task 6: OMDb client

**Files:**
- Create: `lib/external/omdb.ts`
- Test: `tests/unit/omdb.test.ts`

**Interfaces:**
- Produces:
  - `parseImdbRating(raw: OmdbResponse): number | null` (pure)
  - `fetchImdbRating(imdbId: string, apiKey: string): Promise<number | null>` — never throws, returns `null` on any failure (per spec: OMDb failure omits the rating, doesn't break the page).
- Consumes: none

- [ ] **Step 1: Write the failing test**

Create `tests/unit/omdb.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseImdbRating, fetchImdbRating, type OmdbResponse } from '../../lib/external/omdb';

describe('parseImdbRating', () => {
  it('parses a valid rating', () => {
    const raw: OmdbResponse = { Response: 'True', imdbRating: '8.8' };
    expect(parseImdbRating(raw)).toBe(8.8);
  });

  it('returns null when OMDb reports no result', () => {
    const raw: OmdbResponse = { Response: 'False', imdbRating: 'N/A' };
    expect(parseImdbRating(raw)).toBeNull();
  });

  it('returns null when the rating is "N/A"', () => {
    const raw: OmdbResponse = { Response: 'True', imdbRating: 'N/A' };
    expect(parseImdbRating(raw)).toBeNull();
  });
});

describe('fetchImdbRating', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and parses the rating for an IMDb id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Response: 'True', imdbRating: '8.8' }),
      }),
    );

    const rating = await fetchImdbRating('tt1375666', 'test-key');

    expect(rating).toBe(8.8);
  });

  it('returns null when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    expect(await fetchImdbRating('tt1375666', 'test-key')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(await fetchImdbRating('tt1375666', 'test-key')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/omdb.test.ts`
Expected: FAIL — `lib/external/omdb.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/external/omdb.ts`:

```ts
export interface OmdbResponse {
  Response: string;
  imdbRating: string;
}

export function parseImdbRating(raw: OmdbResponse): number | null {
  if (raw.Response !== 'True') return null;
  const parsed = Number.parseFloat(raw.imdbRating);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function fetchImdbRating(imdbId: string, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${apiKey}`);
    if (!res.ok) return null;
    const raw = (await res.json()) as OmdbResponse;
    return parseImdbRating(raw);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/omdb.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/external/omdb.ts tests/unit/omdb.test.ts
git commit -m "feat: add OMDb client for IMDb ratings"
```

---

### Task 7: Seed script for real movies

**Files:**
- Create: `scripts/seed-movie.ts`
- Test: `tests/integration/seed-movie.test.ts`

**Interfaces:**
- Consumes: `fetchTmdbMovie` (Task 5), `fetchImdbRating` (Task 6), `createDb`, `movies`, `showtimes` (Task 3)
- Produces: `seedMovie(tmdbId: number, showtimeIsoStrings: string[], db?, tmdbApiKey?, omdbApiKey?): Promise<void>` — inserts or updates a movie (keyed on `tmdb_id`) and appends showtimes.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/seed-movie.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDb } from '../../lib/db/client';
import { movies, showtimes } from '../../lib/db/schema';
import { seedMovie } from '../../scripts/seed-movie';

vi.mock('../../lib/external/tmdb', () => ({
  fetchTmdbMovie: vi.fn().mockResolvedValue({
    tmdbId: 27205,
    imdbId: 'tt1375666',
    title: 'Inception',
    synopsis: 'A thief who steals corporate secrets.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    runtime: 148,
    director: 'Christopher Nolan',
    actors: ['Leonardo DiCaprio', 'Tom Hardy'],
    trailerUrl: 'https://www.youtube.com/watch?v=trailer-key',
  }),
}));

vi.mock('../../lib/external/omdb', () => ({
  fetchImdbRating: vi.fn().mockResolvedValue(8.8),
}));

const db = createDb(process.env.TEST_DATABASE_URL!);

describe('seedMovie', () => {
  beforeEach(async () => {
    await db.delete(showtimes);
    await db.delete(movies);
  });

  it('inserts a movie with its metadata and showtimes', async () => {
    await seedMovie(27205, ['2026-08-01T18:00:00Z'], db, 'tmdb-key', 'omdb-key');

    const rows = await db.select().from(movies);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tmdbId: 27205,
      imdbId: 'tt1375666',
      title: 'Inception',
      director: 'Christopher Nolan',
      actors: ['Leonardo DiCaprio', 'Tom Hardy'],
      imdbRating: '8.8',
    });

    const showtimeRows = await db.select().from(showtimes);
    expect(showtimeRows).toHaveLength(1);
    expect(showtimeRows[0].movieId).toBe(rows[0].id);
  });

  it('updates the existing row when the same tmdbId is seeded again', async () => {
    await seedMovie(27205, [], db, 'tmdb-key', 'omdb-key');
    await seedMovie(27205, [], db, 'tmdb-key', 'omdb-key');

    const rows = await db.select().from(movies);
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/seed-movie.test.ts`
Expected: FAIL — `scripts/seed-movie.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `scripts/seed-movie.ts`:

```ts
import { fetchTmdbMovie } from '../lib/external/tmdb';
import { fetchImdbRating } from '../lib/external/omdb';
import { db as defaultDb } from '../lib/db/client';
import { movies, showtimes } from '../lib/db/schema';

type Database = typeof defaultDb;

export async function seedMovie(
  tmdbId: number,
  showtimeIsoStrings: string[],
  db: Database = defaultDb,
  tmdbApiKey: string = process.env.TMDB_API_KEY!,
  omdbApiKey: string = process.env.OMDB_API_KEY!,
): Promise<void> {
  const metadata = await fetchTmdbMovie(tmdbId, tmdbApiKey);
  const imdbRating = metadata.imdbId ? await fetchImdbRating(metadata.imdbId, omdbApiKey) : null;

  const values = {
    tmdbId: metadata.tmdbId,
    imdbId: metadata.imdbId,
    title: metadata.title,
    synopsis: metadata.synopsis,
    posterUrl: metadata.posterUrl,
    runtime: metadata.runtime,
    director: metadata.director,
    actors: metadata.actors,
    imdbRating: imdbRating !== null ? imdbRating.toFixed(1) : null,
    trailerUrl: metadata.trailerUrl,
  };

  const [movie] = await db
    .insert(movies)
    .values(values)
    .onConflictDoUpdate({ target: movies.tmdbId, set: values })
    .returning();

  if (showtimeIsoStrings.length > 0) {
    await db.insert(showtimes).values(showtimeIsoStrings.map((iso) => ({ movieId: movie.id, startTime: new Date(iso) })));
  }
}

if (require.main === module) {
  const [tmdbIdArg, ...showtimeArgs] = process.argv.slice(2);
  if (!tmdbIdArg) {
    console.error('Usage: npx tsx scripts/seed-movie.ts <tmdbId> [showtimeIso...]');
    process.exit(1);
  }
  seedMovie(Number(tmdbIdArg), showtimeArgs)
    .then(() => {
      console.log('Seeded movie', tmdbIdArg);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

Add to `package.json` `"scripts"`:

```json
"seed": "tsx scripts/seed-movie.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/seed-movie.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-movie.ts tests/integration/seed-movie.test.ts package.json
git commit -m "feat: add seed-movie script combining TMDB and OMDb"
```

---

### Task 8: Extend CI to run integration tests against a real Postgres

**Files:**
- Modify: `.github/workflows/pr.yml`

**Interfaces:**
- Consumes: `npm run db:migrate`, `npm run test:integration` (Tasks 3, 7)

- [ ] **Step 1: Extend the workflow with a Postgres service and integration step**

Modify `.github/workflows/pr.yml` — replace the `test` job with:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: retfenymozi
          POSTGRES_PASSWORD: retfenymozi
          POSTGRES_DB: retfenymozi_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      TEST_DATABASE_URL: postgres://retfenymozi:retfenymozi@localhost:5432/retfenymozi_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit
      - run: npm run db:migrate -- "$TEST_DATABASE_URL"
      - run: npm run test:integration
```

- [ ] **Step 2: Validate the YAML**

Run: `npx -y js-yaml .github/workflows/pr.yml`
Expected: parses with no error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pr.yml
git commit -m "ci: run integration tests against an ephemeral Postgres service"
```

---

### Task 9: Database query functions

**Files:**
- Create: `lib/db/queries.ts`
- Test: `tests/integration/queries.test.ts`

**Interfaces:**
- Consumes: `movies`, `showtimes`, `createDb` (Task 3), `Movie`, `Showtime` (Task 5)
- Produces:
  - `getNowShowing(db?): Promise<Movie[]>`
  - `getMovieById(id: number, db?): Promise<Movie | null>`
  - `getShowtimesForMovie(movieId: number, db?): Promise<Showtime[]>`
  - `getAllShowtimes(db?): Promise<Array<Showtime & { movie: Movie }>>`

  Used by Task 10 (home page), Task 11 (movie detail), Task 12 (showtimes page).

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../lib/db/client';
import { movies, showtimes } from '../../lib/db/schema';
import { getNowShowing, getMovieById, getShowtimesForMovie, getAllShowtimes } from '../../lib/db/queries';

const db = createDb(process.env.TEST_DATABASE_URL!);

const movieFixture = {
  tmdbId: 27205,
  imdbId: 'tt1375666',
  title: 'Inception',
  synopsis: 'A thief who steals corporate secrets.',
  posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  runtime: 148,
  director: 'Christopher Nolan',
  actors: ['Leonardo DiCaprio', 'Tom Hardy'],
  imdbRating: '8.8',
  trailerUrl: 'https://www.youtube.com/watch?v=trailer-key',
};

describe('movie and showtime queries', () => {
  beforeEach(async () => {
    await db.delete(showtimes);
    await db.delete(movies);
  });

  it('getNowShowing returns all movies', async () => {
    await db.insert(movies).values(movieFixture);

    const result = await getNowShowing(db);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: 'Inception', imdbRating: 8.8, actors: ['Leonardo DiCaprio', 'Tom Hardy'] });
  });

  it('getMovieById returns null for a missing id', async () => {
    expect(await getMovieById(999999, db)).toBeNull();
  });

  it('getShowtimesForMovie returns showtimes ordered by start time', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    await db.insert(showtimes).values([
      { movieId: movie.id, startTime: new Date('2026-08-02T18:00:00Z') },
      { movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') },
    ]);

    const result = await getShowtimesForMovie(movie.id, db);

    expect(result).toHaveLength(2);
    expect(result[0].startTime.toISOString()).toBe('2026-08-01T18:00:00.000Z');
  });

  it('getAllShowtimes joins the movie onto each showtime', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') });

    const result = await getAllShowtimes(db);

    expect(result).toHaveLength(1);
    expect(result[0].movie.title).toBe('Inception');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/queries.test.ts`
Expected: FAIL — `lib/db/queries.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/db/queries.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db as defaultDb } from './client';
import { movies, showtimes } from './schema';
import type { Movie, Showtime } from '../types';

type Database = typeof defaultDb;

function rowToMovie(row: typeof movies.$inferSelect): Movie {
  return {
    id: row.id,
    tmdbId: row.tmdbId,
    imdbId: row.imdbId,
    title: row.title,
    synopsis: row.synopsis,
    posterUrl: row.posterUrl,
    runtime: row.runtime,
    director: row.director,
    actors: row.actors,
    imdbRating: row.imdbRating !== null ? Number(row.imdbRating) : null,
    trailerUrl: row.trailerUrl,
  };
}

function rowToShowtime(row: typeof showtimes.$inferSelect): Showtime {
  return { id: row.id, movieId: row.movieId, startTime: row.startTime };
}

export async function getNowShowing(db: Database = defaultDb): Promise<Movie[]> {
  const rows = await db.select().from(movies).orderBy(movies.title);
  return rows.map(rowToMovie);
}

export async function getMovieById(id: number, db: Database = defaultDb): Promise<Movie | null> {
  const rows = await db.select().from(movies).where(eq(movies.id, id)).limit(1);
  return rows[0] ? rowToMovie(rows[0]) : null;
}

export async function getShowtimesForMovie(movieId: number, db: Database = defaultDb): Promise<Showtime[]> {
  const rows = await db
    .select()
    .from(showtimes)
    .where(eq(showtimes.movieId, movieId))
    .orderBy(showtimes.startTime);
  return rows.map(rowToShowtime);
}

export async function getAllShowtimes(db: Database = defaultDb): Promise<Array<Showtime & { movie: Movie }>> {
  const rows = await db
    .select()
    .from(showtimes)
    .innerJoin(movies, eq(showtimes.movieId, movies.id))
    .orderBy(showtimes.startTime);

  return rows.map((row) => ({
    ...rowToShowtime(row.showtimes),
    movie: rowToMovie(row.movies),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/queries.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts tests/integration/queries.test.ts
git commit -m "feat: add movie and showtime query functions"
```

---

### Task 10: Home page ("now showing")

**Files:**
- Create: `app/page.tsx`
- Modify: `app/layout.tsx` (nav links)

**Interfaces:**
- Consumes: `getNowShowing` (Task 9), `Movie` (Task 5)

- [ ] **Step 1: Write the home page**

Replace the contents of `app/page.tsx`:

```tsx
import Link from 'next/link';
import { getNowShowing } from '@/lib/db/queries';

export default async function HomePage() {
  const movies = await getNowShowing();

  return (
    <main>
      <h1>Now Showing at RetfenyMozi</h1>
      {movies.length === 0 ? (
        <p>No movies are scheduled right now — check back soon.</p>
      ) : (
        <ul>
          {movies.map((movie) => (
            <li key={movie.id}>
              <Link href={`/movies/${movie.id}`}>
                {movie.posterUrl ? (
                  <img src={movie.posterUrl} alt={`${movie.title} poster`} width={92} />
                ) : (
                  <img src="/placeholder-poster.svg" alt={`${movie.title} poster placeholder`} width={92} />
                )}
                <h2>{movie.title}</h2>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add a placeholder poster asset**

Create `public/placeholder-poster.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="92" height="138" viewBox="0 0 92 138">
  <rect width="92" height="138" fill="#2b2b2b" />
  <text x="46" y="69" fill="#ffffff" font-size="12" text-anchor="middle" dominant-baseline="middle">
    No Poster
  </text>
</svg>
```

- [ ] **Step 3: Add nav links to the layout**

Modify `app/layout.tsx`, inside the `<body>` before `{children}`:

```tsx
<nav>
  <Link href="/">Now Showing</Link>
  <Link href="/showtimes">Showtimes</Link>
  <Link href="/about">About</Link>
</nav>
```

Add `import Link from 'next/link';` to the top of the file if not already present.

- [ ] **Step 4: Verify it builds and type-checks**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 5: Manually verify in the browser**

```bash
npm run dev
```

Visit `http://localhost:3000` — expect either the empty state message (no movies seeded yet) or a list of movies if Task 7's seed script has been run locally.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/layout.tsx public/placeholder-poster.svg
git commit -m "feat: add home page listing now-showing movies"
```

---

### Task 11: Movie detail page

**Files:**
- Create: `app/movies/[id]/page.tsx`

**Interfaces:**
- Consumes: `getMovieById`, `getShowtimesForMovie` (Task 9), `formatShowtime` (Task 4)

- [ ] **Step 1: Write the page**

Create `app/movies/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getMovieById, getShowtimesForMovie } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';

export default async function MovieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const movie = await getMovieById(Number(id));

  if (!movie) {
    notFound();
  }

  const showtimes = await getShowtimesForMovie(movie.id);

  return (
    <main>
      <img
        src={movie.posterUrl ?? '/placeholder-poster.svg'}
        alt={`${movie.title} poster`}
        width={200}
      />
      <h1>{movie.title}</h1>
      <p>{movie.synopsis}</p>
      <dl>
        <dt>Director</dt>
        <dd>{movie.director ?? 'Unknown'}</dd>
        <dt>Cast</dt>
        <dd>{movie.actors.length > 0 ? movie.actors.join(', ') : 'Unknown'}</dd>
        <dt>Runtime</dt>
        <dd>{movie.runtime ? `${movie.runtime} min` : 'Unknown'}</dd>
        {movie.imdbRating !== null && (
          <>
            <dt>IMDb Rating</dt>
            <dd>{movie.imdbRating.toFixed(1)} / 10</dd>
          </>
        )}
      </dl>
      {movie.trailerUrl && (
        <p>
          <a href={movie.trailerUrl} target="_blank" rel="noreferrer">
            Watch trailer
          </a>
        </p>
      )}
      <h2>Showtimes</h2>
      {showtimes.length === 0 ? (
        <p>No showtimes scheduled yet.</p>
      ) : (
        <ul>
          {showtimes.map((showtime) => (
            <li key={showtime.id}>{formatShowtime(showtime.startTime)}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify it builds and type-checks**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 3: Manually verify in the browser**

With `npm run dev` running and at least one movie seeded, click into a movie from the home page. Expect synopsis, director, cast, runtime, IMDb rating (if present), trailer link, and showtimes to render.

- [ ] **Step 4: Commit**

```bash
git add app/movies/
git commit -m "feat: add movie detail page"
```

---

### Task 12: Showtimes list page

**Files:**
- Create: `app/showtimes/page.tsx`

**Interfaces:**
- Consumes: `getAllShowtimes` (Task 9), `formatShowtime` (Task 4)

- [ ] **Step 1: Write the page**

Create `app/showtimes/page.tsx`:

```tsx
import Link from 'next/link';
import { getAllShowtimes } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';

export default async function ShowtimesPage() {
  const showtimes = await getAllShowtimes();

  return (
    <main>
      <h1>Showtimes</h1>
      {showtimes.length === 0 ? (
        <p>No showtimes scheduled right now.</p>
      ) : (
        <ul>
          {showtimes.map((showtime) => (
            <li key={showtime.id}>
              <Link href={`/movies/${showtime.movie.id}`}>{showtime.movie.title}</Link>
              {' — '}
              {formatShowtime(showtime.startTime)}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify it builds and type-checks**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 3: Manually verify in the browser**

Visit `http://localhost:3000/showtimes` — expect movie titles linked to their detail pages, each with a formatted date/time.

- [ ] **Step 4: Commit**

```bash
git add app/showtimes/
git commit -m "feat: add showtimes list page"
```

---

### Task 13: About/contact page

**Files:**
- Create: `app/about/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/about/page.tsx`:

```tsx
export default function AboutPage() {
  return (
    <main>
      <h1>About RetfenyMozi</h1>
      <p>
        RetfenyMozi is a small, single-screen local cinema showing a wide range of films —
        from new releases to classics.
      </p>
      <h2>Contact</h2>
      <p>
        Email: <a href="mailto:info@retfenymozi.example">info@retfenymozi.example</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Verify it builds and type-checks**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add app/about/
git commit -m "feat: add about/contact page"
```

---

### Task 14: Playwright setup, fixture seeding, and the "browse movies" E2E test

**Files:**
- Create: `playwright.config.ts`, `scripts/seed-fixture.ts`, `tests/e2e/browse-movies.spec.ts`

**Interfaces:**
- Consumes: `createDb` (Task 3), `movies`, `showtimes` schema (Task 3)
- Produces:
  - `FIXTURE_MOVIE`, `FIXTURE_SHOWTIME_START`, `seedFixture(db?): Promise<void>` — reused by Task 15 and Task 16's E2E tests, and by the CI E2E job (Task 17).
  - `npm run test:e2e`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Add the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
      },
});
```

Add to `package.json` `"scripts"`:

```json
"test:e2e": "playwright test",
"seed:fixture": "tsx scripts/seed-fixture.ts"
```

- [ ] **Step 3: Write the fixture seed script**

Create `scripts/seed-fixture.ts`:

```ts
import { db as defaultDb } from '../lib/db/client';
import { movies, showtimes } from '../lib/db/schema';

type Database = typeof defaultDb;

export const FIXTURE_MOVIE = {
  tmdbId: 999999,
  imdbId: 'tt9999999',
  title: 'The Operational Engineer',
  synopsis: 'A test movie seeded for end-to-end tests.',
  posterUrl: 'https://example.com/poster.jpg',
  runtime: 120,
  director: 'Ada Lovelace',
  actors: ['Grace Hopper', 'Alan Turing'],
  imdbRating: '8.5',
  trailerUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

export const FIXTURE_SHOWTIME_START = new Date('2026-08-01T18:00:00Z');

export async function seedFixture(db: Database = defaultDb): Promise<void> {
  await db.delete(showtimes);
  await db.delete(movies);
  const [movie] = await db.insert(movies).values(FIXTURE_MOVIE).returning();
  await db.insert(showtimes).values({ movieId: movie.id, startTime: FIXTURE_SHOWTIME_START });
}

if (require.main === module) {
  seedFixture()
    .then(() => {
      console.log('Fixture seeded');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Write the E2E test**

Create `tests/e2e/browse-movies.spec.ts`:

```ts
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
});
```

- [ ] **Step 5: Run the E2E test locally**

```bash
source .env.local
npm run test:e2e -- tests/e2e/browse-movies.spec.ts
```

Expected: 2 passed. (This starts `next dev` via Playwright's `webServer`, seeds the fixture directly into the local `DATABASE_URL`, and drives a real Chromium browser against it.)

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts scripts/seed-fixture.ts tests/e2e/browse-movies.spec.ts package.json package-lock.json
git commit -m "test: add Playwright setup and browse-movies E2E test"
```

---

### Task 15: E2E — showtimes journey

**Files:**
- Create: `tests/e2e/showtimes.spec.ts`

**Interfaces:**
- Consumes: `seedFixture`, `FIXTURE_MOVIE`, `FIXTURE_SHOWTIME_START` (Task 14), `formatShowtime` (Task 4)

- [ ] **Step 1: Write the test**

Create `tests/e2e/showtimes.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the E2E test locally**

```bash
source .env.local
npm run test:e2e -- tests/e2e/showtimes.spec.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/showtimes.spec.ts
git commit -m "test: add showtimes page E2E test"
```

---

### Task 16: E2E — movie detail journey

**Files:**
- Create: `tests/e2e/movie-detail.spec.ts`

**Interfaces:**
- Consumes: `seedFixture`, `FIXTURE_MOVIE` (Task 14)

- [ ] **Step 1: Write the test**

Create `tests/e2e/movie-detail.spec.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the E2E test locally**

```bash
source .env.local
npm run test:e2e -- tests/e2e/movie-detail.spec.ts
```

Expected: 1 passed.

- [ ] **Step 3: Run the full E2E suite together**

```bash
npm run test:e2e
```

Expected: 4 passed (browse-movies has 2, showtimes has 1, movie-detail has 1).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/movie-detail.spec.ts
git commit -m "test: add movie detail page E2E test"
```

---

### Task 17: Deploy PR previews on an ephemeral Neon branch and run E2E against them

**Files:**
- Modify: `.github/workflows/pr.yml`
- Create: `.github/workflows/pr-cleanup.yml`

**Interfaces:**
- Consumes: `npm run db:migrate`, `npm run seed:fixture`, `npm run test:e2e` (Tasks 3, 14)
- Requires these GitHub Actions secrets to exist (documented in Task 22's README, configured manually by a repo admin — not creatable by this plan): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NEON_API_KEY`, `NEON_PROJECT_ID`, `TMDB_API_KEY`, `OMDB_API_KEY`.

- [ ] **Step 1: Add the preview-e2e job to the PR workflow**

Modify `.github/workflows/pr.yml` — add a second job after `test`:

```yaml
  preview-e2e:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm install -g vercel@latest neonctl@latest

      - name: Create ephemeral Neon branch for this PR
        run: |
          neonctl branches create \
            --project-id "${{ secrets.NEON_PROJECT_ID }}" \
            --api-key "${{ secrets.NEON_API_KEY }}" \
            --name "pr-${{ github.event.number }}"

      - name: Read the branch connection string
        id: neon
        run: |
          URL=$(neonctl connection-string "pr-${{ github.event.number }}" \
            --project-id "${{ secrets.NEON_PROJECT_ID }}" \
            --api-key "${{ secrets.NEON_API_KEY }}")
          echo "database_url=$URL" >> "$GITHUB_OUTPUT"

      - run: npm run db:migrate -- "${{ steps.neon.outputs.database_url }}"
      - run: npm run seed:fixture
        env:
          DATABASE_URL: ${{ steps.neon.outputs.database_url }}

      - run: vercel pull --yes --environment=preview --token="${{ secrets.VERCEL_TOKEN }}"
      - run: vercel build --token="${{ secrets.VERCEL_TOKEN }}"
      - name: Deploy preview
        id: deploy
        run: |
          URL=$(vercel deploy --prebuilt --token="${{ secrets.VERCEL_TOKEN }}" \
            -e DATABASE_URL="${{ steps.neon.outputs.database_url }}" \
            -e TMDB_API_KEY="${{ secrets.TMDB_API_KEY }}" \
            -e OMDB_API_KEY="${{ secrets.OMDB_API_KEY }}")
          echo "url=$URL" >> "$GITHUB_OUTPUT"

      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          BASE_URL: ${{ steps.deploy.outputs.url }}
```

- [ ] **Step 2: Write the cleanup workflow**

Create `.github/workflows/pr-cleanup.yml`:

```yaml
name: PR Cleanup

on:
  pull_request:
    types: [closed]

jobs:
  delete-neon-branch:
    runs-on: ubuntu-latest
    steps:
      - run: npm install -g neonctl@latest
      - run: |
          neonctl branches delete "pr-${{ github.event.number }}" \
            --project-id "${{ secrets.NEON_PROJECT_ID }}" \
            --api-key "${{ secrets.NEON_API_KEY }}" || true
```

The trailing `|| true` prevents failure if the branch was never created (e.g. the PR's `preview-e2e` job failed before branch creation).

- [ ] **Step 3: Validate both workflow files**

Run: `npx -y js-yaml .github/workflows/pr.yml && npx -y js-yaml .github/workflows/pr-cleanup.yml`
Expected: both parse with no error.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pr.yml .github/workflows/pr-cleanup.yml
git commit -m "ci: deploy ephemeral PR previews on their own Neon branch and run E2E against them"
```

---

### Task 18: Staging deploy on merge to main

**Files:**
- Create: `.github/workflows/main.yml`

**Interfaces:**
- Consumes: `npm run db:migrate` (Task 3)
- Requires secrets: `VERCEL_TOKEN`, `STAGING_DATABASE_URL`, `STAGING_DOMAIN` (a Vercel-managed alias, e.g. `staging-retfenymozi.vercel.app`).

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/main.yml`:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit

      - run: npm run db:migrate -- "${{ secrets.STAGING_DATABASE_URL }}"

      - run: npm install -g vercel@latest
      - run: vercel pull --yes --environment=preview --token="${{ secrets.VERCEL_TOKEN }}"
      - run: vercel build --token="${{ secrets.VERCEL_TOKEN }}"
      - name: Deploy and alias to staging
        run: |
          URL=$(vercel deploy --prebuilt --token="${{ secrets.VERCEL_TOKEN }}")
          vercel alias set "$URL" "${{ secrets.STAGING_DOMAIN }}" --token="${{ secrets.VERCEL_TOKEN }}"
          echo "Staging deployment: $URL -> ${{ secrets.STAGING_DOMAIN }}"
```

- [ ] **Step 2: Validate the YAML**

Run: `npx -y js-yaml .github/workflows/main.yml`
Expected: parses with no error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/main.yml
git commit -m "ci: auto-deploy to staging on merge to main"
```

---

### Task 19: Manual promotion to production

**Files:**
- Create: `.github/workflows/promote.yml`

**Interfaces:**
- Consumes: `npm run db:migrate` (Task 3)
- Requires secrets: `VERCEL_TOKEN`, `PRODUCTION_DATABASE_URL`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/promote.yml`:

```yaml
name: Promote to Production

on:
  workflow_dispatch:
    inputs:
      deployment_url:
        description: 'Staging deployment URL to promote to production'
        required: true

jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci

      - run: npm run db:migrate -- "${{ secrets.PRODUCTION_DATABASE_URL }}"

      - run: npm install -g vercel@latest
      - run: vercel promote "${{ inputs.deployment_url }}" --token="${{ secrets.VERCEL_TOKEN }}" --yes
```

This is a manual, `workflow_dispatch`-only trigger per the spec — there is no automatic path to production. It migrates the production database first, and only promotes the already-built, already-tested staging deployment (no rebuild), per the design's "promote the already-tested staging build to production."

- [ ] **Step 2: Validate the YAML**

Run: `npx -y js-yaml .github/workflows/promote.yml`
Expected: parses with no error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/promote.yml
git commit -m "ci: add manual production promotion workflow"
```

---

### Task 20: Terraform — Vercel project

**Files:**
- Create: `infra/main.tf`, `infra/variables.tf`, `infra/vercel.tf`

**Interfaces:**
- Produces: `vercel_project.retfenymozi` (consumed by Task 21 only by proximity, no direct reference)

- [ ] **Step 1: Write the Terraform root and provider config**

Create `infra/main.tf`:

```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.6"
    }
  }
}

provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team_id
}

provider "neon" {
  api_key = var.neon_api_key
}
```

- [ ] **Step 2: Write the shared variables**

Create `infra/variables.tf`:

```hcl
variable "vercel_api_token" {
  type      = string
  sensitive = true
}

variable "vercel_team_id" {
  type    = string
  default = null
}

variable "github_repo" {
  description = "owner/repo of the GitHub repository to link to the Vercel project"
  type        = string
}

variable "tmdb_api_key" {
  type      = string
  sensitive = true
}

variable "omdb_api_key" {
  type      = string
  sensitive = true
}

variable "neon_api_key" {
  type      = string
  sensitive = true
}

variable "staging_database_url" {
  type      = string
  sensitive = true
}

variable "production_database_url" {
  type      = string
  sensitive = true
}
```

- [ ] **Step 3: Write the Vercel project resource**

Create `infra/vercel.tf`:

```hcl
resource "vercel_project" "retfenymozi" {
  name      = "retfenymozi"
  framework = "nextjs"

  git_repository = {
    type = "github"
    repo = var.github_repo
  }
}

resource "vercel_project_environment_variable" "tmdb_api_key" {
  project_id = vercel_project.retfenymozi.id
  key        = "TMDB_API_KEY"
  value      = var.tmdb_api_key
  target     = ["production", "preview", "development"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "omdb_api_key" {
  project_id = vercel_project.retfenymozi.id
  key        = "OMDB_API_KEY"
  value      = var.omdb_api_key
  target     = ["production", "preview", "development"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "database_url_production" {
  project_id = vercel_project.retfenymozi.id
  key        = "DATABASE_URL"
  value      = var.production_database_url
  target     = ["production"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "database_url_preview" {
  project_id = vercel_project.retfenymozi.id
  key        = "DATABASE_URL"
  value      = var.staging_database_url
  target     = ["preview"]
  sensitive  = true
}
```

- [ ] **Step 4: Validate the configuration**

```bash
cd infra
terraform init -backend=false
terraform fmt -check
terraform validate
cd ..
```

Expected: `terraform validate` prints `Success! The configuration is valid.` (this does not require real credentials — `validate` only checks syntax and internal consistency, not live variable values or provider API calls.)

- [ ] **Step 5: Commit**

```bash
git add infra/main.tf infra/variables.tf infra/vercel.tf
git commit -m "infra: add Terraform config for the Vercel project"
```

---

### Task 21: Terraform — Neon project and branches

**Files:**
- Create: `infra/neon.tf`

**Interfaces:**
- Consumes: `provider "neon"` (Task 20)

- [ ] **Step 1: Write the Neon resources**

Create `infra/neon.tf`:

```hcl
resource "neon_project" "retfenymozi" {
  name      = "retfenymozi"
  region_id = "aws-eu-central-1"
}

resource "neon_branch" "staging" {
  project_id = neon_project.retfenymozi.id
  name       = "staging"
}

resource "neon_branch" "production" {
  project_id = neon_project.retfenymozi.id
  name       = "production"
}
```

The staging and production connection strings produced by these branches are fetched once (via the Neon dashboard or `neonctl connection-string`) and stored as the `staging_database_url` / `production_database_url` Terraform variables and the matching GitHub Actions secrets — Terraform declares that the branches exist, but does not wire the connection string automatically, since it changes rarely and is more predictable to set explicitly than to chain through a provider's computed attributes for a security-sensitive value.

- [ ] **Step 2: Validate the configuration**

```bash
cd infra
terraform init -backend=false
terraform fmt -check
terraform validate
cd ..
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Commit**

```bash
git add infra/neon.tf
git commit -m "infra: add Terraform config for the Neon project and branches"
```

---

### Task 22: README — setup, deploy, and promotion runbook

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Create `README.md`:

```markdown
# RetfenyMozi

The website for RetfenyMozi, a small single-screen local cinema. This sub-project
is the walking skeleton: movie listings, showtimes, and about/contact pages,
backed by Postgres, deployed through a full CI/CD pipeline. There is no
booking or admin UI yet — content is managed through versioned seed scripts.

## Local development

Prerequisites: Node 20+, Docker.

\`\`\`bash
npm install
docker compose up -d db
cp .env.example .env.local   # fill in TMDB_API_KEY and OMDB_API_KEY
source .env.local
npm run db:generate          # only needed after changing lib/db/schema.ts
npm run db:migrate -- "$DATABASE_URL"
npm run db:migrate -- "$TEST_DATABASE_URL"
npm run dev
\`\`\`

Seed a real movie (requires TMDB_API_KEY and OMDB_API_KEY):

\`\`\`bash
npm run seed -- 27205 "2026-08-01T18:00:00" "2026-08-02T18:00:00"
\`\`\`

The first argument is the TMDB movie id, followed by any number of ISO 8601
showtimes.

## Tests

\`\`\`bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires TEST_DATABASE_URL, migrated
npm run test:e2e           # requires DATABASE_URL, migrated; starts its own dev server
\`\`\`

## Infrastructure and required secrets

Terraform (in \`infra/\`) declares the Vercel project and the Neon project/branches.
Run \`terraform init && terraform plan\` from \`infra/\` with the variables in
\`infra/variables.tf\` supplied via a \`terraform.tfvars\` file (not committed) or
\`-var\` flags.

The following GitHub Actions repository secrets must be configured for the
pipeline to run (set by a repo admin — Terraform does not create GitHub
secrets):

| Secret | Used by | Purpose |
|---|---|---|
| `VERCEL_TOKEN` | pr.yml, main.yml, promote.yml | Deploys and promotes via the Vercel CLI |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | pr.yml, main.yml | Non-interactive `vercel pull` |
| `NEON_API_KEY`, `NEON_PROJECT_ID` | pr.yml, pr-cleanup.yml | Creates/deletes the ephemeral per-PR database branch |
| `TMDB_API_KEY`, `OMDB_API_KEY` | pr.yml | Movie metadata for the PR preview deployment |
| `STAGING_DATABASE_URL`, `STAGING_DOMAIN` | main.yml | Migrates and aliases the staging deployment |
| `PRODUCTION_DATABASE_URL` | promote.yml | Migrates the production database before promotion |

## Pipeline

- **Every PR:** lint, typecheck, unit + integration tests (against an ephemeral
  Postgres service), then a full preview deploy on its own ephemeral Neon
  branch with Playwright E2E tests run against it. The branch is deleted when
  the PR closes.
- **Merge to `main`:** tests re-run, migrations apply to the staging database,
  and the build is deployed and aliased to the staging domain.
- **Promotion to production:** manual only, via the "Promote to Production"
  GitHub Actions workflow (`workflow_dispatch`), passing the staging
  deployment URL. Applies migrations to the production database, then
  promotes the already-built staging deployment — no rebuild.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add setup, testing, and deployment runbook"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task — Architecture/pages → Tasks 10–13; Data Model → Task 3; Environments → Tasks 17–19; CI/CD Pipeline → Tasks 2, 8, 17–19; Infrastructure as Code → Tasks 20–21; Testing Strategy → Tasks 1, 4–9, 14–16; Error Handling (TMDB/OMDb fallback) → Tasks 5–6, 10–11; Error Handling (migration fail-fast) → Task 3's `scripts/migrate.ts` propagates any migration error as a non-zero exit, which fails the calling CI step and blocks the workflow.
- **Type consistency checked:** `Movie`/`Showtime`/`MovieMetadata` (Task 5) are used identically in `lib/db/queries.ts` (Task 9), the seed scripts (Tasks 7, 14), and every page (Tasks 10–12). `createDb`/`db` (Task 3) are the sole DB entry points used by every later task that touches the database.
- **No placeholders:** every step has literal file contents or literal commands; nothing is marked TBD.
