# Production catalog snapshot (metadata only)

Captured through Supabase SQL MCP on 2026-11-01 04:17 UTC. This file contains schema/security metadata and approximate row statistics only; no customer names, phones, order payloads, file contents, or credentials.

## Row estimates from pg_stat_user_tables

| Schema.table | Estimated live rows |
|---|---:|
| public.audit_logs | 9 |
| public.orders | 4 |
| public.payment_records | 0 |
| public.products | 5 |
| public.staff_members | 1 |
| public.store_settings | 2 |
| public.track_order_rate_limits | 2 |
| storage.buckets | 1 |
| storage.objects | 8 |

These are PostgreSQL planner statistics, not exact COUNT(*) results and may be stale.

## Storage bucket

- `scan-it-uploads`: private (`public=false`)
- Maximum file size: 10,485,760 bytes (10 MiB)
- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif, application/pdf
- Signed URLs requested by staff UI: 900 seconds (15 minutes), verified by source review only.

## Public schema tables and notable access model

- `orders`: public INSERT policy for pending orders with proof submitted; authenticated staff SELECT/UPDATE require orders or payments permission; no customer SELECT policy was present in the catalog snapshot.
- `staff_members`: authenticated SELECT own profile or employees permission; INSERT/UPDATE/DELETE require employees permission; self-privilege-change trigger exists.
- `payment_records`: staff permissions required for SELECT/INSERT/UPDATE.
- `products`: anon can SELECT active rows; authenticated staff with products permission can manage.
- `store_settings`: anon can read only pricing/public_store; settings permission for management.
- `audit_logs`: manager/settings/employees read; authenticated staff insert only with own actor_id and a recognized permission.
- `track_order_rate_limits`: RLS enabled, no permissive policies; table ACL contains only postgres and service_role (anon/authenticated absent).

## SECURITY DEFINER inventory

| Function | SECURITY DEFINER | search_path |
|---|---:|---|
| private.has_staff_permission(text) | yes | public, pg_temp |
| public.consume_track_order_rate_limit(text, integer) | yes | public, pg_temp |

Both use a fixed search_path including pg_temp last. The private permission helper is executable by authenticated, but it only returns a boolean based on auth.uid(), active staff row, and assigned permissions. The rate-limit RPC is not executable by anon/authenticated.

## ACL observation

The six ordinary public business tables (audit_logs, orders, payment_records, products, staff_members, store_settings) have broad table-level grants to anon/authenticated, with RLS policies providing the row/action restrictions. The rate-limit table does not. This increases the importance of complete RLS policy coverage and negative tests.

## Reproduction query outline

The catalog snapshot was obtained from information_schema.columns, pg_policies, pg_proc/pg_get_functiondef, pg_class.relacl, pg_stat_user_tables, and storage.buckets. Exact live DDL/data backup was not produced; this is a metadata snapshot, not a restorable backup.
