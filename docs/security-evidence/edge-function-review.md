# Edge Function review

Date: 2026-11-01. Source retrieved from deployed Supabase Edge Functions using MCP.

## Deployed baseline findings

### track-order (active, verify_jwt=false)
- CORS allowed any origin (`*`).
- Used cf-connecting-ip, then client-supplied x-forwarded-for, then x-real-ip.
- One rate-limit bucket by IP hash (limit 10); no per-order secondary bucket.
- Validated order number format and selected only public tracking fields.
- Generic client error catch; service key read from server environment.

### delete-archive-orders (active, verify_jwt=true)
- Validates Bearer token with auth.getUser.
- Requires active owner/manager role.
- CORS allowed any origin (`*`).
- Storage failure returned internal error.message and partial file count to client.
- Main catch was generic.

## Branch changes committed (not deployed)

- Added source at `supabase/functions/track-order/index.ts`:
  - allowlist of Vercel project domains known from Vercel project metadata;
  - dynamic Access-Control-Allow-Origin only for allowlisted origin;
  - Vary: Origin;
  - drops x-forwarded-for and x-real-ip; trusts cf-connecting-ip only, otherwise uses a shared fail-closed bucket;
  - adds independent SHA-256 order-number bucket (limit 5) in addition to IP bucket (limit 10).
- Added source at `supabase/functions/delete-archive-orders/index.ts`:
  - same CORS allowlist and Vary;
  - no internal Storage error detail or partial count returned to client;
  - internal failure details go to console logs;
  - generic client error response.
- Corrected Bearer token regex after source verification.

## Not tested

No live HTTP POST/OPTIONS invocation was available through the connected Supabase/GitHub/Vercel tools in this run. No JWT role tests, CORS browser tests, rate-limit load tests, or delete-operation tests were run. These changes are branch-only and the deployed functions remain unchanged.
