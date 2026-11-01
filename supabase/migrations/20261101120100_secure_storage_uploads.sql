-- Route customer file uploads through the secure-upload Edge Function.
-- The function validates file signatures and uploads with service_role.
begin;
drop policy if exists "customers can upload their own checkout files" on storage.objects;
drop policy if exists "product staff can upload product images" on storage.objects;
create policy "product staff can upload product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'scan-it-uploads'
  and (storage.foldername(name))[1] = 'product-images'
  and lower(storage.extension(name)) = any (array['jpg','jpeg','png','webp','gif'])
  and public.has_staff_permission('products')
);
commit;
