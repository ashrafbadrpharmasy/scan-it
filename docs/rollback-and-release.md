# Rollback and release procedure

## Database migrations

- `20261101035917_prevent_self_staff_privilege_changes.sql`: use `supabase/rollback/20261101035917_prevent_self_staff_privilege_changes.sql` only if the trigger causes a verified regression. It removes only the trigger/function added by that migration.
- `20261101120000_deny_api_access_track_order_rate_limits.sql`: use `supabase/rollback/20261101120000_deny_api_access_track_order_rate_limits.sql`. The pre-change catalog snapshot showed no direct grants to `anon` or `authenticated`; rollback drops the explicit deny policy and keeps those grants revoked.
- `20261030150633_restrict_storage_reads.sql`: see `supabase/rollback/20261030_restrict_storage_reads.rollback.md`. Exact prior policy SQL is not in the repository, so an executable rollback would be unsafe until retrieved from a verified backup.

## Vercel rollback

1. Open Vercel → Scan It project → Deployments.
2. Identify the last known-good deployment with target Production and confirm its commit SHA.
3. Use the deployment menu → Promote to Production (or the documented rollback action available in the current UI).
4. Verify the production aliases point to the previous deployment.
5. Run the live smoke checks: response headers/CSP, landing page, login/logout, test order creation, and public order tracking.
6. Record the deployment IDs, timestamps, HTTP status codes, and test results in the security evidence folder.

Do not use a preview deployment as a production rollback target. Never roll back by deploying an unreviewed commit.

## Release gates

- Repository must be private before any database or Storage backup artifact is uploaded.
- Encrypted production backup must complete and be restored successfully in an isolated runner database; table counts and every Storage object's SHA-256 must match.
- All isolated security, browser, and Edge Function tests must pass.
- Production migrations must be dry-run and reviewed before application.
- Deploy Edge Functions one at a time and smoke-test each before proceeding.
- Promote Vercel only after Edge Function checks pass.
- If a core flow fails, roll back Vercel first, then apply only the verified migration rollback corresponding to the failing migration.
