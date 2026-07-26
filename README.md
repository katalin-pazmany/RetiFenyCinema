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
npm run db:generate          # only needed after changing lib/db/schema.ts
npm run db:migrate -- "$DATABASE_URL"
npm run db:migrate -- "$TEST_DATABASE_URL"
npm run dev
```

Seed a real movie (requires TMDB_API_KEY and OMDB_API_KEY):

```bash
npm run seed -- 27205 "2026-08-01T18:00:00" "2026-08-02T18:00:00"
```

The first argument is the TMDB movie id, followed by any number of ISO 8601
showtimes.

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
