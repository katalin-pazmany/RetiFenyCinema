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

variable "stripe_secret_key" {
  type      = string
  sensitive = true
}

variable "stripe_webhook_secret" {
  type      = string
  sensitive = true
}

variable "resend_api_key" {
  type      = string
  sensitive = true
}

variable "booking_from_email" {
  description = "Sender of the booking confirmation email; must be on a domain verified with Resend"
  type        = string
}

variable "production_site_url" {
  description = "Public base URL of the production deployment, e.g. https://retfenymozi.com"
  type        = string
}

variable "staging_site_url" {
  description = "Public base URL of the staging deployment, used for preview builds"
  type        = string
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
