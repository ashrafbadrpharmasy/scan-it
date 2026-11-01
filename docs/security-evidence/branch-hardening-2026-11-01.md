# Branch hardening evidence — 2026-11-01

Scope: Git branch `security/hardening-followup-2026-11-01` only. No production database changes, Edge Function deployment, PR merge, or production deployment were performed by this phase.

## Changes

1. `supabase/functions/track-order/index.ts`
   - Secondary order-number rate limiting now hashes the order number together with the trusted ingress IP hash.
   - This avoids a global order bucket that any unauthenticated visitor could exhaust to deny tracking for all customers of a target order.
   - If `cf-connecting-ip` is absent, the function uses the existing shared fallback IP bucket and skips the secondary per-order bucket. Live ingress-header behavior remains unverified.

2. `order.html`
   - Configurable InstaPay destination is parsed with the URL API and assigned only when protocol is HTTPS.
   - Invalid or non-HTTPS values remove the anchor destination.

3. `vercel.json`
   - Added `X-Permitted-Cross-Domain-Policies: none`.
   - Added `X-DNS-Prefetch-Control: off`.
   - Added `Cross-Origin-Opener-Policy: same-origin`.
   - Existing CSP still allows unsafe-inline because inline scripts, event handlers, and styles remain in the static pages.

4. `tests/security-static.test.mjs`
   - Added static assertions for order/IP rate-limit scoping, HTTPS-only InstaPay URL assignment, escaped staff/product values, and the additional response headers.

## Verification status

- Latest branch source inspected after writes.
- Seven focused source assertions for the new edits matched.
- GitHub Actions test run for the latest commit was not returned by the workflow-run lookup; therefore no claim is made that the full Node test suite passed on this commit.
- Vercel reported a successful preview deployment status for the latest commit. This confirms preview build/deployment only, not live security behavior.
- Supabase Security Advisor still reports leaked-password protection disabled and an informational RLS-enabled/no-policy finding on `public.track_order_rate_limits`.
- No Edge Function deployment, database migration, production rollout, or live HTTP/browser test was performed.

## Remaining blockers

- Full database and Storage backup with checksums and a successful isolated restore.
- Isolated Auth/RLS role matrix with disposable identities.
- Actual browser XSS and file-upload content-signature tests.
- Live CORS, trusted-IP header, rate-limit, JWT, and archive deletion tests.
- Strict CSP refactor and live response-header verification.
- Enable Supabase Auth leaked-password protection in the dashboard.
