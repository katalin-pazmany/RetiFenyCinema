/**
 * The absolute base URL to build customer-facing links from (Stripe
 * success/cancel URLs, the cancellation link in the confirmation email).
 *
 * Resolution order:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — set explicitly for production and staging, which
 *    have stable URLs (wired in `infra/vercel.tf`). Note that Next.js inlines
 *    `NEXT_PUBLIC_*` at build time, so this must be present when `next build`
 *    runs, not merely at deploy time.
 * 2. `VERCEL_URL` — Vercel populates this system environment variable on every
 *    deployment, at both build and runtime, with the deployment's generated
 *    domain and no protocol scheme. This is what covers ephemeral PR previews,
 *    whose URL is not known until after `vercel deploy` returns and therefore
 *    cannot be passed in ahead of time.
 * 3. `http://localhost:3000` for local development and tests.
 *
 * Caveat on (2): Vercel only injects system environment variables while
 * "Enable access to System Environment Variables" is on for the project (it is
 * on by default), and `VERCEL_URL` points at the deployment-specific domain,
 * which is unreachable to third parties under Standard Deployment Protection.
 * Neither affects production or staging, which resolve via (1).
 */
export function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}
