# RetfenyMozi

The website for RetfenyMozi, a small single-screen local cinema. This sub-project
is the walking skeleton: movie listings, showtimes, and about/contact pages,
backed by Postgres, deployed through a full CI/CD pipeline. There is no
booking or admin UI yet — content is managed through versioned seed scripts.

## Local development

Prerequisites: Node 20+, Docker.

```bash
npm install
docker compose up -d db
cp .env.example .env.local   # fill in TMDB_API_KEY and OMDB_API_KEY
set -a; source .env.local; set +a
```

Booking (seats, payments, email) additionally needs:
- `STRIPE_SECRET_KEY` — a Stripe **test-mode** secret key (free, from the Stripe dashboard). Required for the booking E2E test and for actually completing a checkout locally; not required for unit/integration tests, which either test pure functions or use a constructed Stripe event rather than a live API call.
- `STRIPE_WEBHOOK_SECRET` — from `stripe listen --forward-to localhost:3000/api/webhooks/stripe` when testing webhooks locally (the Stripe CLI prints a `whsec_...` value), or from the webhook endpoint's settings in the Stripe dashboard once deployed.
- `RESEND_API_KEY` — a free Resend API key, needed to actually send confirmation emails.

Run `npm run seed:seats` once to populate the 80 fixed seats and the three ticket types (Adult/Child/Senior) — this only needs to happen once per database, not per movie.

```bash
npm run db:generate          # only needed after changing lib/db/schema.ts
npm run db:migrate -- "$DATABASE_URL"
npm run db:migrate -- "$TEST_DATABASE_URL"
npm run dev
```

Seed a real movie (requires TMDB_API_KEY and OMDB_API_KEY):

```bash
npm run seed -- 27205 "2026-08-01T18:00:00Z" "2026-08-02T18:00:00Z"
```

The first argument is the TMDB movie id, followed by any number of ISO 8601
showtimes.

Always give showtimes a `Z` suffix (or an explicit `+HH:MM` offset). An
offset-less ISO string is parsed by `new Date()` in the *operator's* local
timezone, so the same command would store a different instant when run from a
UTC CI box than from a Budapest laptop.

## Tests

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires TEST_DATABASE_URL, migrated
npm run test:e2e           # requires DATABASE_URL, migrated; starts its own dev server
```

## Infrastructure and required secrets

Terraform (in `infra/`) declares the Vercel project and the Neon project/branches.
Run `terraform init && terraform plan` from `infra/` with the variables in
`infra/variables.tf` supplied via a `terraform.tfvars` file (not committed) or
`-var` flags.

The following GitHub Actions repository secrets must be configured for the
pipeline to run (set by a repo admin — Terraform does not create GitHub
secrets):

| Secret | Used by | Purpose |
|---|---|---|
| `VERCEL_TOKEN` | pr.yml, main.yml, promote.yml | Deploys and promotes via the Vercel CLI |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | pr.yml, main.yml, promote.yml | Non-interactive project linking for `vercel pull`/`build`/`deploy`/`promote` |
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

### Why the content pages are `force-dynamic`

`app/page.tsx` and `app/showtimes/page.tsx` both set
`export const dynamic = 'force-dynamic'`. This is load-bearing, not a
performance preference.

Without it, Next.js classifies these `async` server components as static and
prerenders them once during `next build`. The build process opens a database
connection using whatever `DATABASE_URL` the build environment had, runs the
queries, and bakes the *result rows* into static HTML. Two things break as a
consequence:

1. **Content management stops working.** Content is managed exclusively via the
   seed scripts, so re-seeding a deployed environment would change nothing
   visible until someone triggered a fresh deploy.
2. **PR-preview E2E tests assert against the wrong database.** `pr.yml`
   provisions an ephemeral Neon branch per PR and seeds the fixture into it,
   but `vercel build` runs after `vercel pull --environment=preview`, so a
   prerendered page would have baked in the *preview-target* (staging)
   database's contents. The tests would pass or fail against data the job
   never controlled.

With `force-dynamic`, the pages are server-rendered per request, so
`process.env.DATABASE_URL` is read by the deployed Node function at request
time rather than by the build process.

### Known limitation: which database a promoted deployment serves

`main.yml` builds the staging deployment with `vercel pull --environment=preview`,
so it is created as a *preview*-target deployment and is built against
`staging_database_url` (see `infra/vercel.tf`). `promote.yml` then runs
`vercel promote <url>` with no rebuild.

**It is not verified that the promoted deployment serves the production
database.** The reasoning is genuinely two-sided and could not be settled
without a live Vercel project:

- *Argument that it works:* `DATABASE_URL` has no `NEXT_PUBLIC_` prefix, so
  Next.js never inlines it into a bundle at build time the way it does public
  vars. Server code reads `process.env.DATABASE_URL` in the deployed runtime.
  If Vercel repopulates a deployment's process environment from the
  production-target variables once that deployment becomes the production
  deployment, promotion is correct with no rebuild.
- *Argument that it does not:* Vercel's well-known behavior is that changing an
  environment variable's value requires a redeploy before existing deployments
  pick it up. That implies a deployment carries an env set **resolved when the
  deployment was created**, based on its target at that moment — here,
  `preview`. `vercel promote` changes which deployment serves production
  traffic; it is not established that it re-resolves that snapshot. If it does
  not, production would serve the **staging** database.

Fixing the `force-dynamic` issue above is **necessary but not sufficient** for
this. It definitively removes build-time *data* baking — no row values are in
the HTML any more, which is verifiable locally. It does not by itself settle
how Vercel resolves the *connection string* for a promoted deployment.

Before relying on the first real production promotion, an operator must verify
this against the live project — promote, then confirm the production domain
reflects production-only data. If it serves staging data, the fix is to stop
promoting a preview build and instead have `promote.yml` build and deploy with
production env (`vercel pull --environment=production`, `vercel build --prod`,
`vercel deploy --prebuilt --prod`), accepting the rebuild.

### Known gap: no E2E tests against staging

`main.yml` runs lint, typecheck, unit, and integration tests before deploying to
staging, but no E2E suite runs against the deployed staging environment. Closing
this needs a job restructure — the deployment has to exist and be aliased before
Playwright can be pointed at it, with promotion gated on the result — which was
out of scope for the current pass.
