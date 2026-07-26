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
