# Migration history gap

Production Supabase reports these eight migration records:

| Production version | Name | SQL file present in branch |
|---|---|---|
| 20261029140802 | initial_scan_it_store_schema | No |
| 20261029140818 | server_calculated_order_totals | No |
| 20261029141121 | enforce_order_field_permissions | No |
| 20261029141141 | harden_permission_function | No |
| 20261029141223 | optimize_store_policies_and_indexes | No |
| 20261030100426 | add_public_order_tracking_note | No |
| 20261030150633 | restrict_storage_reads_and_audit_actor | Partial: `20261030150633_restrict_storage_reads.sql` is present |
| 20261101035917 | prevent_self_staff_privilege_changes | Present as `20261101035917_prevent_self_staff_privilege_changes.sql` |

The current branch does not contain the original SQL for the first six production migrations. The production migration registry exposes their names/versions, not the original SQL bodies. Reconstructing those migrations from the live schema would not be an exact migration replay and could change behavior.

The isolated workflow therefore imports a schema-only production snapshot when the optional `DATABASE_URL` secret exists, then applies the new branch-only Storage upload migration in the local runner. This is a test of the current production schema plus branch changes, **not** a full replay of all historical migrations.

Before claiming full migration replay:
1. Recover the exact original SQL for the first six migrations from a trusted backup/source repository.
2. Add those exact files with production versions and verify their checksums.
3. Run `supabase db reset` in a fresh local stack.
4. Compare schema objects, policies, functions, triggers, indexes, and ACLs against the schema-only production snapshot.
