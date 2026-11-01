# Scan It — Security Hardening Report

**Date:** 2026-11-01  
**Repository:** https://github.com/ashrafbadrpharmasy/scan-it  
**Branch:** `security/hardening-followup-2026-11-01`  
**Pull request:** [#2](https://github.com/ashrafbadrpharmasy/scan-it/pull/2)  
**Production:** unchanged. No migration, Edge Function, or Vercel deployment was made.

## Executive result

<badge>NOT READY FOR PRODUCTION</badge>

The branch contains meaningful hardening work and CI automation, but production closure is blocked by three evidence gates: the repository is **public**, no encrypted backup/restore has been completed, and the latest isolated Supabase workflow has not completed. The backup workflow is deliberately guarded and must not upload database or Storage data while the repository remains public.

## What changed

1. **Employee dashboard / XSS**
   - Kept the existing escaping and URL validation approach and tightened the HTML sanitizer to permit only a constrained set of elements/attributes, including a narrow style allowlist.
   - Added/expanded static regression tests for the dashboard and URL handling.
   - This is not yet proof that every dynamic DOM sink is safe; browser XSS tests still need a completed isolated run and a full sink inventory.

2. **Content-validated customer uploads**
   - Added `supabase/functions/secure-upload/index.ts`.
   - Validates file signatures for PNG, JPEG, WEBP, GIF and PDF, checks declared MIME matches detected content, enforces 10 MiB maximum, uses random storage paths, and returns generic errors.
   - Changed `order.html` to call this function rather than upload directly from the browser.
   - Added migration `supabase/migrations/20261101120100_secure_storage_uploads.sql` to remove direct customer insert policy and retain product-image uploads for authorized product staff; added rollback.
   - Production dry-run was executed inside `BEGIN/ROLLBACK` and returned without SQL error. **Migration not applied.**

3. **Password security**
   - Added HIBP Pwned Passwords k-anonymity check in `supabase/functions/password-security/index.ts`; the full password is not sent to HIBP.
   - Password recovery UI routes through the Edge Function and now displays a safe error on failure.
   - UI minimum length is 12. This does not enforce a global Auth password policy for every client path; manual Supabase Auth settings remain necessary.

4. **Edge Functions**
   - Branch source exists for `track-order`, `delete-archive-orders`, `password-security`, and `secure-upload`.
   - Hardened sources use an explicit origin allowlist and `Vary: Origin`, generic user-facing errors, and safer rate-limit identity handling.
   - Local smoke tests cover unauthenticated archive deletion, unauthenticated password changes, CORS, invalid tracking input, rate limiting (when DB schema is present), and MIME spoofing (when DB schema is present).
   - **No function was deployed.** The deployed origins/allowlist still require verification against actual production and preview domains before release.

5. **CSP and security headers**
   - Replaced `unsafe-inline` in the branch CSP with exact script/style hashes and `unsafe-hashes` for inline event/style attributes.
   - Added Playwright checks for landing, order, and staff pages under the configured CSP.
   - Static test workflow confirms the CSP contains no `unsafe-inline`. This does not yet prove all browser flows work; the isolated Playwright workflow is still pending.

6. **Database and RLS**
   - Added rate-limit table deny migration and explicit rollback.
   - Existing self-staff privilege-change migration remains in the branch.
   - Prior production read-only tests showed anonymous and synthetic customer roles could not read orders; rate-limit RPC execution was denied to anon/authenticated; private Storage object listing returned zero to anon.
   - Full manager/staff/suspended role matrix remains unproven. No real manager account was used.

7. **Automation and evidence**
   - Added `.github/workflows/security-isolated.yml` to start a disposable Supabase stack on GitHub Actions, run tests and save artifacts.
   - Latest static workflow run **41309788807** completed successfully.
   - Latest isolated run **41309788802** was still in progress at report time; it is not counted as passed.
   - Production schema import is conditional on `DATABASE_URL`. If the secret is absent, schema-aware tests are skipped and explicitly not reported as passed.
   - Added migration-history gap evidence because six historical production migration SQL bodies are not in this repository. A schema snapshot is not equivalent to replaying those original migrations.

## Evidence and status

| Check | Status | Evidence |
|---|---|---|
| Static security regression suite | ✅ | GitHub Actions run [41309788807](https://github.com/ashrafbadrpharmasy/scan-it/actions/runs/41309788807), completed success |
| Isolated Supabase + browser + Edge tests | ⚠️ | Run [41309788802](https://github.com/ashrafbadrpharmasy/scan-it/actions/runs/41309788802) was still in progress; no pass claimed |
| Production RLS catalog and limited role tests | ⚠️ | `docs/security-evidence/production-catalog-snapshot.md`, `role-simulation.md`, `production-sql-role-tests.sql` |
| Storage upload migration dry-run | ✅ | Supabase SQL `BEGIN/ROLLBACK` returned no error; no persistent production change |
| Storage real-content upload tests | ⚠️ | Test is authored for isolated Edge runner; latest isolated run not complete |
| CSP static policy | ✅ | Static test asserts no `unsafe-inline`; browser verification pending |
| Employee DOM/XSS full browser tests | ⚠️ | Sanitizer and tests updated; browser run pending |
| Edge Function source hardening | ⚠️ | Branch code reviewed; production functions unchanged and not deployed |
| Password HIBP check | ⚠️ | Branch function and recovery UI present; end-to-end Auth flow not proven |
| Repository privacy | ❌ | GitHub API reports `visibility=public`, `private=false` |
| Encrypted production backup | ❌ | Not run; workflow blocks public repositories |
| Restore verification | ❌ | Not run |
| Vercel live CSP/order smoke | ❌ | Not run; no production deployment |
| Historical migration replay | ❌ | Six original migration SQL bodies are missing; see `docs/security-evidence/migration-history-gap.md` |

## Scores (evidence-based)

| Area | Score / 10 | Reason |
|---|---:|---|
| Database and RLS | 6 | Catalog review and limited production role probes; full role matrix and full migration replay absent |
| Staff and permissions | 5 | Self-escalation protection and UI checks; manager/suspended role tests not complete |
| Files and Storage | 6 | Private bucket, content-signature validator and migration prepared; no end-to-end verified upload/restore |
| Website protection | 6 | Strict hash CSP authored and static-tested; browser suite not complete and all sinks not fully proven |
| Edge Functions | 5 | Hardened source and smoke tests authored; not deployed or fully executed against local schema |
| Backup and restore | 1 | Backup workflow authored but blocked by public repo; no backup or restore evidence |
| Deployment and secrets | 3 | Static CI passed; production secret audit and live deployment verification incomplete |

**Overall score: 4/10.** This is a cautious rounded assessment, not an average that hides the backup/restore blocker. No category is rated 10/10.

## Required manual steps before production

1. **Make the GitHub repository private** (Settings → General → Change repository visibility). The current repository is public; do not upload production data or backup artifacts before this is done.
2. Add GitHub Actions secrets: `DATABASE_URL`, `BACKUP_PASSPHRASE`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Add values only in GitHub Settings; never send them in chat or commit them.
3. Run the manual workflow **Encrypted production backup**. Confirm encrypted DB and Storage artifacts exist.
4. Run the restore-verification workflow and verify table counts, Storage object counts and SHA-256 checksums. No restore claim until this succeeds.
5. Recover the exact SQL for the six missing historical migrations listed in `docs/security-evidence/migration-history-gap.md`; add and verify them before claiming full migration replay.
6. In Supabase Dashboard → Authentication → Password Security, set minimum password length to 12 and enable Leaked Password Protection if the plan permits it. Security Advisor previously reported it disabled.
7. Verify the exact production and preview Vercel domains against the Edge Function CORS allowlists.
8. Wait for isolated Supabase/Playwright/Edge workflow to complete successfully and review its artifact. Fix any failures and rerun.
9. Only after all gates pass: merge PR #2, apply migrations one by one, deploy each Edge Function individually, then promote Vercel and run live smoke tests.

## Rollback

- Database rollback scripts are in `supabase/rollback/`. The Storage-read policy rollback is documented as incomplete because exact prior SQL must be recovered first.
- Vercel rollback procedure: `docs/rollback-and-release.md`. Promote the last known-good Production deployment, verify aliases, then test headers, login, order creation and tracking.
- Do not merge, migrate, deploy functions or promote Vercel while backup/restore and isolated tests remain unverified.

## Important limitations

No production rows were modified. No customer data was exported. No backup artifact was uploaded. No production migration was applied. No Edge Function was deployed. No Vercel production deployment was created.
