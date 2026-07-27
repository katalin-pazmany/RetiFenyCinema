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

resource "vercel_project_environment_variable" "stripe_secret_key" {
  project_id = vercel_project.retfenymozi.id
  key        = "STRIPE_SECRET_KEY"
  value      = var.stripe_secret_key
  target     = ["production", "preview", "development"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "stripe_webhook_secret" {
  project_id = vercel_project.retfenymozi.id
  key        = "STRIPE_WEBHOOK_SECRET"
  value      = var.stripe_webhook_secret
  target     = ["production", "preview", "development"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "resend_api_key" {
  project_id = vercel_project.retfenymozi.id
  key        = "RESEND_API_KEY"
  value      = var.resend_api_key
  target     = ["production", "preview", "development"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "booking_from_email" {
  project_id = vercel_project.retfenymozi.id
  key        = "BOOKING_FROM_EMAIL"
  value      = var.booking_from_email
  target     = ["production", "preview", "development"]
}

# NEXT_PUBLIC_SITE_URL differs per environment, like DATABASE_URL below.
# Next.js inlines NEXT_PUBLIC_* at build time, so these values are what the
# build sees — hence set on the project rather than passed at deploy time,
# which is too late to affect a prebuilt bundle.
#
# Note that Vercel's "preview" target covers both the staging alias and
# ephemeral PR previews, so PR previews inherit staging_site_url here. The
# VERCEL_URL fallback in lib/site-url.ts is the safety net for any deployment
# built without this variable, not a per-PR override of it.
resource "vercel_project_environment_variable" "site_url_production" {
  project_id = vercel_project.retfenymozi.id
  key        = "NEXT_PUBLIC_SITE_URL"
  value      = var.production_site_url
  target     = ["production"]
}

resource "vercel_project_environment_variable" "site_url_preview" {
  project_id = vercel_project.retfenymozi.id
  key        = "NEXT_PUBLIC_SITE_URL"
  value      = var.staging_site_url
  target     = ["preview"]
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
