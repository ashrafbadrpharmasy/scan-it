# Cloud security findings — 2026-11-01

## Repository visibility and backup gate

- GitHub repository visibility read through repository metadata: `public`.
- No production dump or Storage object was uploaded by this work.
- `.github/workflows/backup-encrypted.yml` checks repository visibility before accessing backup secrets or creating backup files and exits without upload unless visibility is `private`.
- Backup workflow requires GitHub Actions secrets: `DATABASE_URL`, `BACKUP_PASSPHRASE`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Secret presence has not been confirmed because the secrets endpoint is not available through the connected GitHub interface.

## Deployed Edge Function source inventory

Retrieved from the live Supabase project using the Supabase function-source endpoint:

| Function | Live version | Live verify_jwt | Live source SHA-256 |
|---|---:|---:|---|
| `track-order` | 2 | false (public tracking) | `2baf9f731003117ba2720ab52cbd8d0fb5c91a85dfe44e26cbcd332e501868a2` |
| `delete-archive-orders` | 3 | true | `f6ee7ffac33f81b0188a7efe12630839356d50f3d842816ce9411d1a0b4560cc` |

The deployed versions use wildcard CORS. The deployed tracking source trusts `x-forwarded-for` / `x-real-ip` fallback headers. The deployed archive source returns a Storage error detail field to the caller. Hardened branch source is present at:
- `supabase/functions/track-order/index.ts`
- `supabase/functions/delete-archive-orders/index.ts`

New branch-only functions:
- `supabase/functions/password-security/index.ts`: HIBP k-anonymity check, authenticated password change via Auth admin API.
- `supabase/functions/secure-upload/index.ts`: server-side signature sniffing for PNG/JPEG/WEBP/GIF/PDF, 10 MiB cap, origin allowlist and rate limiting.

No Edge Function was deployed during this assessment.

## Production Storage migration dry-run

Executed through Supabase SQL against production, in one transaction:

```sql
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
rollback;
```

Tool result: empty result set, no SQL error. The transaction ended with ROLLBACK; production policy state was not changed.

## Password creation paths

The current staff dashboard does not create Auth users; it upserts an existing `staff_members.user_id`. There is no `signUp` / `inviteUserByEmail` / `auth.admin.createUser` flow in the browser pages. The password reset flow is now routed through the branch-only `password-security` Edge Function. This does not globally prevent a caller from bypassing the UI and calling Supabase Auth directly; leaked-password protection remains disabled according to Supabase Security Advisor.

## Migration replay limitation

See `docs/security-evidence/migration-history-gap.md`. Six production migration SQL bodies are absent from the repository, so full historical migration replay is not yet proven.
