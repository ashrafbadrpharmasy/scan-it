-- Storage policies used by the isolated test stack after importing the production public/private schema.
-- This fixture intentionally excludes audit_logs policy DDL to avoid replaying schema state twice.
drop policy if exists "order and payment staff can read customer uploads" on storage.objects;
create policy "order and payment staff can read customer uploads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'scan-it-uploads'
  and (storage.foldername(name))[1] = 'customer-uploads'
  and (
    public.has_staff_permission('orders')
    or public.has_staff_permission('payments')
  )
);
drop policy if exists "product staff can read product images" on storage.objects;
create policy "product staff can read product images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'scan-it-uploads'
  and (storage.foldername(name))[1] = 'product-images'
  and public.has_staff_permission('products')
);
