# Rollback notes: 20261030_restrict_storage_reads.sql

A safe executable rollback cannot be generated from the available evidence because the exact definition of the pre-migration policy named `staff can read customer uploads` was not preserved in the branch. Recreating a guessed policy could expose customer uploads.

Before rollback:
1. Restore the database to a tested backup or retrieve the exact pre-migration policy definition from the migration/backup evidence.
2. Confirm the exact policy predicates for `storage.objects` and `public.audit_logs`.
3. In a transaction, drop only the two policies created by the migration:
   - `order and payment staff can read customer uploads`
   - `product staff can read product images`
   - `staff can write own audit logs`
4. Recreate the exact prior policy definitions from the verified backup, then commit.
5. Run the isolated Storage and audit-log role matrix before any production rollout.

Do not execute a rollback that merely drops these policies: that can silently change staff access and is not a complete rollback.
