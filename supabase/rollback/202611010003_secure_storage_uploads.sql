-- Rollback for 202611010003_secure_storage_uploads.sql.
-- Restores the exact customer-upload policy observed in production before this migration.
begin;
drop policy if exists "product staff can upload product images" on storage.objects;
create policy "customers can upload their own checkout files"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'scan-it-uploads'
  and (storage.foldername(name))[1] = 'customer-uploads'
  and lower(storage.extension(name)) = any (array['jpg','jpeg','png','webp','gif','pdf'])
);
commit;
