-- Rollback for migration 202611010002_deny_api_access_track_order_rate_limits.sql
-- The pre-migration catalog snapshot recorded no anon/authenticated table grants.
-- Do not add grants back; remove only the explicit deny policy.
begin;
drop policy if exists deny_api_access_track_order_rate_limits on public.track_order_rate_limits;
revoke all on table public.track_order_rate_limits from anon, authenticated;
commit;
