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
