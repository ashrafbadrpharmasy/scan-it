-- All statements are read-only and transaction-scoped.
-- Execute each block separately; do not remove ROLLBACK.
begin;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select count(*)::int as anon_orders_visible from public.orders;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select count(*)::int as fake_customer_orders_visible from public.orders;
select public.has_staff_permission('orders') as fake_customer_orders_permission;
select has_function_privilege(current_user,'public.consume_track_order_rate_limit(text,integer)','EXECUTE') as auth_can_execute_rate_rpc;
rollback;

begin;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select has_function_privilege(current_user,'public.consume_track_order_rate_limit(text,integer)','EXECUTE') as anon_can_execute_rate_rpc;
select count(*)::int as anon_storage_objects_visible from storage.objects where bucket_id='scan-it-uploads';
rollback;
