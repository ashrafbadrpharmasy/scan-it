-- Explicitly deny direct API access to the rate-limit table.
-- RLS is already enabled; no policies currently exist, so access is implicitly denied.
-- This migration makes the intent explicit and revokes table privileges from API roles.
begin;
revoke all on table public.track_order_rate_limits from anon, authenticated;
drop policy if exists deny_api_access_track_order_rate_limits on public.track_order_rate_limits;
create policy deny_api_access_track_order_rate_limits
on public.track_order_rate_limits
for all
to anon, authenticated
using (false)
with check (false);
commit;

-- ROLLBACK:
-- drop policy if exists deny_api_access_track_order_rate_limits on public.track_order_rate_limits;
-- NOTE: Re-grant only the exact pre-migration privileges captured from pg_catalog before rollback.
-- No grants are restored automatically because the pre-migration ACL must be verified first.
