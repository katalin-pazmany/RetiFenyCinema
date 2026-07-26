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
