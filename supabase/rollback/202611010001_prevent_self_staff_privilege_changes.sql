-- Rollback for migration 202611010001_prevent_self_staff_privilege_changes.sql
-- Run only after confirming the trigger/function are the branch migration objects.
begin;
drop trigger if exists prevent_self_staff_privilege_changes on public.staff_members;
drop function if exists public.prevent_self_staff_privilege_changes();
commit;
