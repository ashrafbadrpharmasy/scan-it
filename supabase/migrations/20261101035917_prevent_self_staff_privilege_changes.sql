-- Prevent an employee from changing their own role, permissions, or active state.
-- This is an additive database safeguard. Review and apply only after staging verification.
create or replace function public.prevent_self_staff_privilege_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.user_id
     and (
       new.role is distinct from old.role
       or new.permissions is distinct from old.permissions
       or new.active is distinct from old.active
     )
  then
    raise exception 'Employees cannot change their own role, permissions, or active status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_self_staff_privilege_changes on public.staff_members;
create trigger prevent_self_staff_privilege_changes
before update on public.staff_members
for each row
execute function public.prevent_self_staff_privilege_changes();
