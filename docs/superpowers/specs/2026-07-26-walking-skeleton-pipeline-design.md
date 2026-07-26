# RetfenyMozi: Walking Skeleton & CI/CD Pipeline

## Context

RetfenyMozi is a small, single-screen local cinema that shows a wide range of
films. This project is a portfolio-first build: the site itself is real and
usable, but the primary goal is to demonstrate solid operational engineering
— a real CI/CD pipeline, environment promotion, infrastructure as code, and
automated testing — rather than to maximize product features.

Because the full product (public site, online booking, staff admin
dashboard, and an operational-maturity pass) spans multiple independent
subsystems, it is split into sub-projects, each with its own spec and
implementation plan:

1. **Walking skeleton & pipeline** (this document) — public site, database,
   and full CI/CD pipeline.
2. **Booking system** — seat selection, reservations, payments, transactional
   email (Resend).
3. **Admin dashboard** — staff-facing UI to manage movies/showtimes and view
   sales/occupancy.
4. **Operational maturity pass** — observability/monitoring, analytics
   (Mixpanel), alerting, and any hardening the earlier phases surfaced a need
   for.

This document scopes sub-project 1 only.

## Goal

Ship a public-facing cinema site (movie listings, showtimes, about/contact)
backed by a real database, deployed through a CI/CD pipeline that includes
automated testing, environment promotion (preview → staging → production),
and infrastructure as code.

## Out of Scope (this sub-project)

- Booking, seat selection, payments
- Admin/back-office UI — content is managed via versioned seed/migration
  scripts for now
- Transactional email (Resend)
- Product analytics (Mixpanel)
- Monitoring/alerting beyond what Vercel provides by default

## Architecture

- **Framework:** Next.js (App Router), deployed on Vercel.
- **Database:** Postgres via Neon, storing movies and showtimes.
- **Movie metadata:** TMDB API supplies poster, synopsis, rating, and runtime
  when a movie is added via seed script. On TMDB failure, the app falls back
  to the last-cached data and shows a placeholder poster rather than failing
  the page.
- **Content management:** movies and showtimes are added/edited through
  versioned seed/migration scripts checked into the repo. A real admin UI is
  deferred to sub-project 3.

### Pages

- Home — now showing
- Movie detail
- Showtimes list
- About / contact

### Data Model

- `Movie`: id, tmdb_id, title, synopsis, poster_url, rating, runtime
- `Showtime`: id, movie_id (FK), start_time

No room field is needed on `Showtime` since the cinema has only one screen.

## Environments

| Environment | Trigger | Database |
|---|---|---|
| Local | developer machine | Neon branch or local Postgres |
| Preview | opened per PR | Neon branch, torn down when the PR closes |
| Staging | merge to `main` | staging Neon branch |
| Production | explicit promotion | production Neon branch |

## CI/CD Pipeline (GitHub Actions)

**On pull request:**
1. Lint and type-check
2. Unit and integration tests, run against a real ephemeral Postgres instance
3. Vercel creates a preview deployment
4. Playwright E2E tests run against the preview deployment

All checks must pass before merge is allowed.

**On merge to `main`:**
1. Full test suite re-runs
2. Database migrations apply to the staging database
3. Vercel deploys to staging automatically

**Promotion to production:**
- Explicit manual step (`workflow_dispatch`), never automatic
- Applies migrations to the production database
- Promotes the already-tested staging build to production

Migration failures fail the pipeline fast and block promotion — the app is
never deployed against an unmigrated schema.

## Infrastructure as Code

Terraform manages, declaratively:
- The Vercel project (environment variables, domains)
- The Neon Postgres instance and branches

Plan runs on every PR; apply happens on merge to `main` (manual apply is
acceptable for the first pass, for safety).

## Testing Strategy

- **Unit:** business logic — e.g. TMDB response mapping, showtime/date
  formatting
- **Integration:** API routes exercised against a real test database
- **E2E (Playwright):** core journeys — browse movies, view a showtime, open
  movie detail

## Error Handling

- **TMDB API failure:** fall back to last-cached movie data; show a
  placeholder poster. The page must not fail to render.
- **Migration failure:** pipeline fails fast; promotion is blocked until
  resolved.

## Future Work

Sub-projects 2–4 (booking, admin dashboard, operational maturity) are
tracked separately and will each get their own spec once this sub-project is
implemented.
