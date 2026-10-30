-- Scan It security hardening: restrict customer upload reads to order/payment staff.
-- Product managers do not need access to customer logos, menus, or payment proofs.
-- Product image access is separately scoped to the product-images folder.
begin;

drop policy if exists "staff can read customer uploads" on storage.objects;

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

create policy "product staff can read product images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'scan-it-uploads'
  and (storage.foldername(name))[1] = 'product-images'
  and public.has_staff_permission('products')
);

commit;
