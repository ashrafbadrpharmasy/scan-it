# Transaction-scoped role simulation evidence

Date: 2026-11-01. All test SQL calls used `BEGIN` and `ROLLBACK`; no persistent rows were changed.

## Executed tests and returned results

1. `BEGIN; SET LOCAL ROLE anon; ... SELECT count(*) FROM public.orders; ROLLBACK;`
   - Result: `anon_orders_visible = 0`.
2. `BEGIN; SET LOCAL ROLE authenticated; request.jwt.claims sub=11111111-1111-4111-8111-111111111111; SELECT count(*) FROM public.orders; ROLLBACK;`
   - Result: `fake_customer_orders_visible = 0`.
3. Same authenticated fake-customer claim:
   - `public.has_staff_permission('orders') = false`
   - `has_function_privilege(current_user,'public.consume_track_order_rate_limit(text,integer)','EXECUTE') = false`
   - `has_function_privilege(current_user,'private.has_staff_permission(text)','EXECUTE') = true`
4. `BEGIN; SET LOCAL ROLE anon; ...`
   - `anon_can_execute_rate_rpc = false`
   - `anon_storage_objects_visible = 0`.

## Limitation discovered

A transaction that attempted to insert fake staff_members rows directly failed immediately with FK violation `staff_members_user_id_fkey`: the user_id must exist in auth.users. No fake Auth users were created, and no data was changed. Thus employee, manager, suspended employee, self-escalation, manager-only employee creation, and full customer-to-staff order lifecycle are **not integration-tested**. Creating ephemeral auth.users records via direct SQL was not attempted because it would manipulate Supabase Auth internals and risk unsupported side effects.

## Interpretation

These results are evidence for anon/customer order invisibility and denial of the rate-limit RPC. They do not prove the full RLS role matrix, storage upload restrictions, or the staff trigger under PostgREST sessions.
